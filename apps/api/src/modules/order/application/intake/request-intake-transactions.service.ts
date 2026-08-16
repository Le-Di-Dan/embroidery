/**
 * The two durable steps of an APP5 intake upload (`APP5-B02`, `IMP-D048`).
 *
 * The same two-transaction shape as `APP2-B01` and `APP3-B06B`, for the same
 * reason: Tx A makes the asset truthfully `UPLOADED` the moment the binary
 * exists, Tx B hands it to inspection. Collapsing them would erase the recovery
 * window IDX-086 sweeps — a crash between the object landing and the handoff
 * would leave no row at all rather than a real, findable `UPLOADED` asset.
 *
 * ### Tx A is where the quota is decided
 *
 * The reservation *is* the asset row, so the only place a check can be sound is
 * the transaction that inserts it, under the challenge lock that serializes
 * competing inserts. The pre-stream check the service performs is a courtesy —
 * it refuses the hopeless case before a caller uploads ten megabytes — and it is
 * explicitly **not** the arbiter. That distinction matters: two requests can
 * both pass the pre-check, and exactly one of them will pass here.
 *
 * ### Provenance is written here or nowhere
 *
 * `uploaded_by_customer_id`, `uploaded_via_challenge_id` and
 * `intake_expires_at` all come from {@link ChallengeIntakeAuthorizer}, inside
 * this transaction, from the locked challenge row. None is reachable from the
 * request. CST-127 and CST-128 are the database's backstop for that, not its
 * substitute — a row this service could not build is a row the schema should
 * still refuse.
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
  ASSET_REPOSITORY,
  type Asset,
  type AssetId,
  type AssetRepository,
} from '../../../asset/domain/repositories/asset.repository';
import { assetIntakeError } from '../../../asset/domain/asset-intake.errors';
import {
  ASSET_INSPECTION_EVENT_TYPE,
  ASSET_INSPECTION_PAYLOAD_VERSION,
} from '../../../asset/domain/asset-intake.policy';
import type { ConsumedFile } from '../../../asset/infrastructure/http/validated-file.reader';
import type { ChallengeId } from '../../../customer/domain/repositories/verification-challenge.repository';
import {
  REQUEST_INTAKE_ASSET_KIND,
  REQUEST_INTAKE_CLASSIFICATION,
} from '../../domain/intake/request-intake.policy';
import {
  decodeRequestIntakeCompleted,
  REQUEST_INTAKE_RESULT_SCHEMA_VERSION,
  type RequestIntakeAllocation,
  type RequestIntakeCompleted,
} from '../../domain/intake/request-intake-result.codec';
import { ChallengeIntakeAuthorizer } from './challenge-intake.authorizer';

export interface RequestIntakeFacts extends ConsumedFile {
  readonly contentFingerprint: string;
}

@Injectable()
export class RequestIntakeTransactionsService {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly allocations: IdempotencyAllocationStore,
    private readonly outbox: OutboxEventStore,
    private readonly authorizer: ChallengeIntakeAuthorizer,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
  ) {}

  /**
   * Tx A — the object exists, so the row may now exist, if there is room.
   *
   * The lane fixes kind and classification; neither is reachable from the
   * request, so a caller cannot land a row in the catalog lane or make its own
   * upload public.
   */
  async commitReservedAsset(input: {
    readonly key: IdempotencyKey;
    readonly allocation: RequestIntakeAllocation;
    readonly challengeId: ChallengeId;
    readonly facts: RequestIntakeFacts;
    readonly at: Date;
  }): Promise<Asset> {
    const { key, allocation, challengeId, facts, at } = input;

    return this.transactions.runInTransaction(async () => {
      await this.assertClaimHeld(key, allocation);

      // Re-authorized under the lock, not merely re-counted: a challenge that
      // expired or was submitted while the bytes were in flight must not gain a
      // reservation just because it was live when the upload started.
      const authorized = await this.authorizer.authorizeAndReserve(challengeId, at);

      const { asset, recovered } = await this.assets.registerOrRecover({
        id: allocation.assetId as AssetId,
        kind: REQUEST_INTAKE_ASSET_KIND,
        classification: REQUEST_INTAKE_CLASSIFICATION,
        storageKey: allocation.objectKey,
        mimeType: facts.mediaType,
        sizeBytes: BigInt(facts.byteSize),
        checksum: facts.checksum,
        uploadedByCustomerId: authorized.customerId,
        intakeProvenance: {
          challengeId: authorized.challengeId,
          expiresAt: authorized.intakeExpiresAt,
        },
      });

      // Two different files reaching one allocated identity has no safe
      // resolution, so it is refused rather than resolved in someone's favour.
      if (recovered && !matchesIntakeFacts(asset, facts)) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }
      return asset;
    });
  }

  /**
   * Tx B — one guarded asset transition, one inspection event, one completed
   * record. All or nothing.
   *
   * No association is written and no second event is appended. APP5 intake has
   * nothing to associate the asset *with* yet — that is `APP5-B01`'s binding,
   * and it happens only for an `ACCEPTED` asset at submission time. There is no
   * normalization event either: a customer's evidence photograph is never
   * rendered into a design, so requesting a derivative for it would be work
   * with no consumer.
   */
  async commitInspectionHandoff(input: {
    readonly key: IdempotencyKey;
    readonly allocation: RequestIntakeAllocation;
    readonly facts: RequestIntakeFacts;
    readonly at: Date;
  }): Promise<{ readonly asset: Asset; readonly result: RequestIntakeCompleted }> {
    const { key, allocation, facts, at } = input;

    return this.transactions.runInTransaction(async () => {
      await this.assertClaimHeld(key, allocation);

      const asset = await this.assets.beginInspection(allocation.assetId as AssetId, at);
      if (asset === undefined || !matchesIntakeFacts(asset, facts)) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }

      const inspectionEventId = await this.outbox.append({
        eventType: ASSET_INSPECTION_EVENT_TYPE,
        aggregateKind: 'ASSET',
        aggregateId: asset.id,
        payload: { schemaVersion: ASSET_INSPECTION_PAYLOAD_VERSION, assetId: asset.id },
        payloadSchemaVersion: ASSET_INSPECTION_PAYLOAD_VERSION,
      });

      const result = decodeRequestIntakeCompleted({
        schemaVersion: REQUEST_INTAKE_RESULT_SCHEMA_VERSION,
        kind: 'CUSTOM_REQUEST_INTAKE_COMPLETED',
        assetId: allocation.assetId,
        role: allocation.role,
        bucketAlias: allocation.bucketAlias,
        objectKey: allocation.objectKey,
        mediaType: facts.mediaType,
        byteSize: facts.byteSize,
        checksum: facts.checksum,
        contentFingerprint: facts.contentFingerprint,
        inspectionEventId: inspectionEventId.toString(),
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
    allocation: RequestIntakeAllocation,
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
export function matchesIntakeFacts(asset: Asset, facts: ConsumedFile): boolean {
  return (
    asset.mimeType === facts.mediaType &&
    asset.sizeBytes === BigInt(facts.byteSize) &&
    asset.checksum === facts.checksum &&
    asset.kind === REQUEST_INTAKE_ASSET_KIND &&
    asset.classification === REQUEST_INTAKE_CLASSIFICATION
  );
}
