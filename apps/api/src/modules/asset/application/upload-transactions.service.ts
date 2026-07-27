/**
 * Tx A and Tx B, the two durable steps of an intake (`ADR-APP2-001` §4.2f-5).
 *
 * They are two transactions rather than one on purpose. Tx A makes the asset
 * truthfully `UPLOADED` the moment the binary exists; Tx B hands it to
 * inspection. Collapsing them would erase the recovery window that IDX-086
 * sweeps — a crash between the object landing and the handoff would leave no
 * row at all instead of a real, findable `UPLOADED` asset.
 *
 * Both verify the claim token **inside** their own transaction. A request whose
 * allocation was reclaimed while it was streaming matches zero rows and mutates
 * nothing, rather than overwriting the receipt of the attempt that won.
 *
 * No object-store call happens here. These bodies touch the database only.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  TransactionManager,
  OutboxEventStore,
  IdempotencyAllocationStore,
} from '@embroidery/persistence';
import type { IdempotencyKey } from '@embroidery/persistence';

import { assetIntakeError } from '../domain/asset-intake.errors';
import {
  ASSET_INSPECTION_EVENT_TYPE,
  ASSET_INSPECTION_PAYLOAD_VERSION,
  INTAKE_ASSET_KIND,
  INTAKE_CLASSIFICATION,
} from '../domain/asset-intake.policy';
import {
  decodeCompleted,
  UPLOAD_RESULT_SCHEMA_VERSION,
  type AssetUploadAllocation,
  type AssetUploadCompleted,
} from '../domain/upload-result.codec';
import {
  ASSET_REPOSITORY,
  type Asset,
  type AssetId,
  type AssetRepository,
} from '../domain/repositories/asset.repository';
import type { ConsumedFile } from '../infrastructure/http/validated-file.reader';

export interface DurableFacts extends ConsumedFile {
  readonly contentFingerprint: string;
}

@Injectable()
export class UploadTransactionsService {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly allocations: IdempotencyAllocationStore,
    private readonly outbox: OutboxEventStore,
    @Inject(ASSET_REPOSITORY) private readonly repository: AssetRepository,
  ) {}

  /**
   * Tx A — the object exists, so the row may now exist.
   *
   * A recovered row must agree with what was just measured on every immutable
   * fact. A mismatch means two different files reached one allocated identity,
   * and the only safe answer is to refuse rather than to pick a winner.
   */
  async commitUploadedAsset(input: {
    readonly key: IdempotencyKey;
    readonly allocation: AssetUploadAllocation;
    readonly facts: DurableFacts;
  }): Promise<Asset> {
    const { key, allocation, facts } = input;

    return this.transactions.runInTransaction(async () => {
      await this.assertClaimHeld(key, allocation);

      const { asset, recovered } = await this.repository.registerOrRecover({
        id: allocation.assetId as AssetId,
        kind: INTAKE_ASSET_KIND,
        classification: INTAKE_CLASSIFICATION,
        storageKey: allocation.objectKey,
        mimeType: facts.mediaType,
        sizeBytes: BigInt(facts.byteSize),
        checksum: facts.checksum,
      });

      if (recovered && !matchesDurableFacts(asset, facts)) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }
      return asset;
    });
  }

  /**
   * Tx B — one guarded transition, one outbox event, one completed result.
   *
   * The transition is the guard: if the row is no longer `UPLOADED`, no event
   * is appended, so the "exactly one inspection event per asset" property is a
   * consequence of the state machine rather than of a uniqueness constraint.
   */
  async commitInspectionHandoff(input: {
    readonly key: IdempotencyKey;
    readonly allocation: AssetUploadAllocation;
    readonly facts: DurableFacts;
    readonly at: Date;
  }): Promise<{ readonly asset: Asset; readonly result: AssetUploadCompleted }> {
    const { key, allocation, facts, at } = input;

    return this.transactions.runInTransaction(async () => {
      await this.assertClaimHeld(key, allocation);

      const asset = await this.repository.beginInspection(allocation.assetId as AssetId, at);
      if (asset === undefined) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }
      if (!matchesDurableFacts(asset, facts)) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }

      const eventId = await this.outbox.append({
        eventType: ASSET_INSPECTION_EVENT_TYPE,
        aggregateKind: 'ASSET',
        aggregateId: asset.id,
        // Minimal and versioned: the worker reads the asset row for everything
        // else, so nothing here can go stale or leak.
        payload: { schemaVersion: ASSET_INSPECTION_PAYLOAD_VERSION, assetId: asset.id },
        payloadSchemaVersion: ASSET_INSPECTION_PAYLOAD_VERSION,
      });

      const result = buildCompletedResult(allocation, facts, eventId);
      const completed = await this.allocations.completeHeldClaim({
        key,
        claimToken: allocation.claimToken,
        result,
      });
      if (!completed) {
        throw assetIntakeError('STALE_UPLOAD_CLAIM');
      }
      return { asset, result };
    });
  }

  /**
   * Completes a record whose asset already reached `INSPECTING` under a
   * previous attempt, without re-transitioning it or appending a second event.
   */
  async completeFromExistingIntent(input: {
    readonly key: IdempotencyKey;
    readonly allocation: AssetUploadAllocation;
    readonly facts: DurableFacts;
    readonly eventId: bigint;
  }): Promise<AssetUploadCompleted> {
    const { key, allocation, facts, eventId } = input;

    return this.transactions.runInTransaction(async () => {
      await this.assertClaimHeld(key, allocation);
      const result = buildCompletedResult(allocation, facts, eventId);
      const completed = await this.allocations.completeHeldClaim({
        key,
        claimToken: allocation.claimToken,
        result,
      });
      if (!completed) {
        throw assetIntakeError('STALE_UPLOAD_CLAIM');
      }
      return result;
    });
  }

  /**
   * Re-reads the claim under a row lock and proves this attempt still owns it.
   *
   * The lock matters as much as the comparison: without it a reclaimer could
   * rotate the token between this check and the write that follows it.
   */
  private async assertClaimHeld(
    key: IdempotencyKey,
    allocation: AssetUploadAllocation,
  ): Promise<void> {
    const locked = await this.allocations.lockForUpdate(key);
    if (locked === undefined || locked.status !== 'IN_PROGRESS') {
      throw assetIntakeError('STALE_UPLOAD_CLAIM');
    }
    if (locked.fingerprint !== key.fingerprint) {
      throw assetIntakeError('IDEMPOTENCY_CONFLICT');
    }
    const current = (locked.result as { claimToken?: unknown } | null)?.claimToken;
    if (current !== allocation.claimToken) {
      throw assetIntakeError('STALE_UPLOAD_CLAIM');
    }
  }
}

/** Every immutable fact the row and the just-measured stream must agree on. */
export function matchesDurableFacts(asset: Asset, facts: ConsumedFile): boolean {
  return (
    asset.mimeType === facts.mediaType &&
    asset.sizeBytes === BigInt(facts.byteSize) &&
    asset.checksum === facts.checksum
  );
}

export function buildCompletedResult(
  allocation: AssetUploadAllocation,
  facts: DurableFacts,
  eventId: bigint,
): AssetUploadCompleted {
  // Decoded rather than cast: the completed result is written once and read
  // many times, so it is validated on the way in as well as on the way out.
  return decodeCompleted({
    schemaVersion: UPLOAD_RESULT_SCHEMA_VERSION,
    kind: 'ASSET_UPLOAD_COMPLETED',
    assetId: allocation.assetId,
    bucketAlias: allocation.bucketAlias,
    objectKey: allocation.objectKey,
    mediaType: facts.mediaType,
    byteSize: facts.byteSize,
    checksum: facts.checksum,
    contentFingerprint: facts.contentFingerprint,
    assetStatus: 'INSPECTING',
    inspectionEventId: eventId.toString(),
  });
}
