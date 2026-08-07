/**
 * The two durable steps of a Session upload (`APP3-B06B`, `IMP-D048` PO-06/PO-09).
 *
 * Same two-transaction shape as `APP2-B01`, for the same reason: Tx A makes the
 * asset truthfully `UPLOADED` the moment the binary exists, Tx B hands it to
 * inspection. Collapsing them would erase the recovery window IDX-086 sweeps — a
 * crash between the object landing and the handoff would leave no row at all
 * rather than a real, findable `UPLOADED` asset.
 *
 * Tx B here does strictly more than the Admin one, and every part of it is in
 * the **same** transaction on purpose. The association, the two events and the
 * revision advance describe one logical fact — "this session now owns this
 * asset and has asked for it to be normalized". Splitting any of them out
 * produces a state nobody can act on: an association with no events (the worker
 * never runs), a revision advance with no association (the Studio shows a change
 * that does not exist), or an `INSPECTING` asset no session claims.
 *
 * No object-store call happens here. These bodies touch the database only.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  IdempotencyAllocationStore,
  OutboxEventStore,
  TransactionManager,
  type IdempotencyKey,
} from '@embroidery/persistence';
import {
  ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
  ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
  buildAssetNormalizationRequestedPayload,
} from '@embroidery/domain-types';

import {
  ASSET_REPOSITORY,
  type Asset,
  type AssetId,
  type AssetRepository,
} from '../../asset/domain/repositories/asset.repository';
import { assetIntakeError } from '../../asset/domain/asset-intake.errors';
import {
  ASSET_INSPECTION_EVENT_TYPE,
  ASSET_INSPECTION_PAYLOAD_VERSION,
} from '../../asset/domain/asset-intake.policy';
import type { ConsumedFile } from '../../asset/infrastructure/http/validated-file.reader';
import {
  DESIGN_SESSION_INTAKE_LANE,
  SESSION_INTAKE_ASSET_KIND,
  SESSION_INTAKE_CLASSIFICATION,
} from '../domain/session-asset-intake.policy';
import {
  decodeSessionCompleted,
  SESSION_UPLOAD_RESULT_SCHEMA_VERSION,
  type SessionUploadAllocation,
  type SessionUploadCompleted,
} from '../domain/session-upload-result.codec';
import {
  DESIGN_SESSION_REPOSITORY,
  type DesignSessionId,
  type DesignSessionRepository,
} from '../domain/repositories/design-session.repository';

export interface SessionDurableFacts extends ConsumedFile {
  readonly contentFingerprint: string;
}

@Injectable()
export class SessionAssetTransactionsService {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly allocations: IdempotencyAllocationStore,
    private readonly outbox: OutboxEventStore,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(DESIGN_SESSION_REPOSITORY) private readonly sessions: DesignSessionRepository,
  ) {}

  /**
   * Tx A — the object exists, so the row may now exist.
   *
   * The lane fixes kind and classification; neither is reachable from the
   * request, so an anonymous caller cannot land a row in the catalog lane.
   */
  async commitUploadedAsset(input: {
    readonly key: IdempotencyKey;
    readonly allocation: SessionUploadAllocation;
    readonly facts: SessionDurableFacts;
  }): Promise<Asset> {
    const { key, allocation, facts } = input;

    return this.transactions.runInTransaction(async () => {
      await this.assertClaimHeld(key, allocation);

      const { asset, recovered } = await this.assets.registerOrRecover({
        id: allocation.assetId as AssetId,
        kind: SESSION_INTAKE_ASSET_KIND,
        classification: SESSION_INTAKE_CLASSIFICATION,
        storageKey: allocation.objectKey,
        mimeType: facts.mediaType,
        sizeBytes: BigInt(facts.byteSize),
        checksum: facts.checksum,
      });

      // Two different files reaching one allocated identity has no safe
      // resolution, so it is refused rather than resolved in someone's favour.
      if (recovered && !matchesFacts(asset, facts)) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }
      return asset;
    });
  }

  /**
   * Tx B — one guarded Asset transition, one guarded Session advance, one
   * association, two events, one completed record. All or nothing.
   *
   * `advanceRevision` runs **before** the association: it is the proof that the
   * session is ACTIVE, unexpired and at the revision the caller read. Attaching
   * first would bind an asset to a session that a concurrent writer had already
   * moved on from, and the refusal would arrive too late to prevent it.
   */
  async commitSessionIntake(input: {
    readonly key: IdempotencyKey;
    readonly allocation: SessionUploadAllocation;
    readonly facts: SessionDurableFacts;
    readonly expectedRevision: number;
    readonly at: Date;
  }): Promise<{ readonly asset: Asset; readonly result: SessionUploadCompleted }> {
    const { key, allocation, facts, expectedRevision, at } = input;

    return this.transactions.runInTransaction(async () => {
      await this.assertClaimHeld(key, allocation);

      const asset = await this.assets.beginInspection(allocation.assetId as AssetId, at);
      if (asset === undefined || !matchesFacts(asset, facts)) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }

      const sessionId = allocation.sessionId as DesignSessionId;
      // Throws STALE_WRITE on a revision, status or expiry mismatch — including
      // a session that expired between authorization and this moment.
      const session = await this.sessions.advanceRevision({ id: sessionId, expectedRevision, at });

      const designSessionAssetId = await this.sessions.attachAsset(sessionId, asset.id);

      const inspectionEventId = await this.outbox.append({
        eventType: ASSET_INSPECTION_EVENT_TYPE,
        aggregateKind: 'ASSET',
        aggregateId: asset.id,
        payload: { schemaVersion: ASSET_INSPECTION_PAYLOAD_VERSION, assetId: asset.id },
        payloadSchemaVersion: ASSET_INSPECTION_PAYLOAD_VERSION,
      });

      // Appended after the association exists, because the association is what
      // gives the event its meaning: `APP3-G06` recorded that an event written
      // before the association that defines the work cannot carry its context.
      // The worker re-derives the profile from this reference at claim time, so
      // nothing about the file, the object or the session travels in the payload.
      const normalizationEventId = await this.outbox.append({
        eventType: ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
        aggregateKind: 'ASSET',
        aggregateId: asset.id,
        payload: {
          ...buildAssetNormalizationRequestedPayload({
            assetId: asset.id,
            associationRef: { kind: 'DESIGN_SESSION_ASSET', designSessionAssetId },
          }),
        },
        payloadSchemaVersion: ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
      });

      const result = decodeSessionCompleted({
        schemaVersion: SESSION_UPLOAD_RESULT_SCHEMA_VERSION,
        kind: 'DESIGN_SESSION_UPLOAD_COMPLETED',
        assetId: allocation.assetId,
        sessionId: allocation.sessionId,
        bucketAlias: allocation.bucketAlias,
        objectKey: allocation.objectKey,
        designSessionAssetId,
        sessionRevision: session.autosaveRevision,
        mediaType: facts.mediaType,
        byteSize: facts.byteSize,
        checksum: facts.checksum,
        contentFingerprint: facts.contentFingerprint,
        inspectionEventId: inspectionEventId.toString(),
        normalizationEventId: normalizationEventId.toString(),
      });

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
   * Re-reads the claim under a row lock and proves this attempt still owns it.
   *
   * The lock matters as much as the comparison: without it a reclaimer could
   * rotate the token between this check and the write that follows.
   */
  private async assertClaimHeld(
    key: IdempotencyKey,
    allocation: SessionUploadAllocation,
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
export function matchesFacts(asset: Asset, facts: ConsumedFile): boolean {
  return (
    asset.mimeType === facts.mediaType &&
    asset.sizeBytes === BigInt(facts.byteSize) &&
    asset.checksum === facts.checksum &&
    asset.kind === DESIGN_SESSION_INTAKE_LANE.assetKind &&
    asset.classification === DESIGN_SESSION_INTAKE_LANE.classification
  );
}
