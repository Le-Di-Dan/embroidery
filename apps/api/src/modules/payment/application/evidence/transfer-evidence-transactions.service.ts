/**
 * The two durable steps of an evidence upload (`APP7-B05` §11, §12, §29).
 *
 * The same two-transaction shape the three shipped lanes use, for the same
 * reason: Tx A makes the asset truthfully `UPLOADED` the moment the binary
 * exists, Tx B decides and records what it is *for*. Collapsing them would erase
 * the recovery window IDX-086 sweeps — a crash between the object landing and
 * the handoff would leave no row at all rather than a real, findable `UPLOADED`
 * asset.
 *
 * ### Tx B is where the quota is decided, and it is the only place it can be
 *
 * `MAX_EVIDENCE_PER_ATTEMPT` counts sibling rows, which a `CHECK` cannot do and
 * a unique index cannot express without also forbidding the second image —
 * `APP7-DB01` proved the database accepts a sixth row on purpose. So the bound
 * is an application guard, and an application guard is sound only under a lock
 * that serializes the competing inserts. That lock is the **attempt row**, taken
 * by the authorizer's `lockAttemptForEvidence`, held for the count and the
 * insert that follow, and released only at commit. Two finalizations racing at
 * four associations therefore queue, and exactly one of them sees four.
 *
 * ### The association is written while the asset is still pre-inspection
 *
 * `APP7-G01` §7.4's one deliberate divergence from `custom_request_assets`, and
 * the reason is recorded there: APP5 binds at a *later* event (submission), and
 * payment evidence has no later event — the customer uploads once, already
 * authorized. So the row is written here, beside the inspection outbox event,
 * while the asset is `UPLOADED`. `APP7-B06`'s Admin preview refuses anything not
 * `ACCEPTED`, which is what keeps an un-inspected image recorded but never
 * served.
 *
 * ### What this service cannot do
 *
 * It writes `assets` and `payment_transfer_evidence` and appends one outbox
 * event. It holds no obligation writer, no order repository, no reconciliation
 * writer and no provider client, so no attempt can be settled, no obligation
 * satisfied, no order moved and no reconciliation appended from here — which is
 * `APP7-B05` §23 made structural rather than asserted.
 *
 * No object-store call happens in either body. These touch the database only.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  IdempotencyAllocationStore,
  OutboxEventStore,
  PaymentTransferEvidenceRepository,
  TransactionManager,
  type IdempotencyKey,
  type TransferEvidenceId,
} from '@embroidery/persistence';

import { assetIntakeError } from '../../../asset/domain/asset-intake.errors';
import {
  ASSET_INSPECTION_EVENT_TYPE,
  ASSET_INSPECTION_PAYLOAD_VERSION,
} from '../../../asset/domain/asset-intake.policy';
import {
  ASSET_REPOSITORY,
  type Asset,
  type AssetId,
  type AssetRepository,
} from '../../../asset/domain/repositories/asset.repository';
import type { ConsumedFile } from '../../../asset/infrastructure/http/validated-file.reader';
import {
  MAX_EVIDENCE_PER_ATTEMPT,
  TRANSFER_EVIDENCE_ASSET_KIND,
  TRANSFER_EVIDENCE_CLASSIFICATION,
} from '../../domain/evidence/transfer-evidence.policy';
import { transferEvidenceError } from '../../domain/evidence/transfer-evidence.errors';
import {
  decodeTransferEvidenceCompleted,
  TRANSFER_EVIDENCE_RESULT_SCHEMA_VERSION,
  type TransferEvidenceAllocation,
  type TransferEvidenceCompleted,
} from '../../domain/evidence/transfer-evidence-result.codec';
import { EvidenceAttemptAuthorizer } from './evidence-attempt.authorizer';

export interface TransferEvidenceFacts extends ConsumedFile {
  readonly contentFingerprint: string;
}

@Injectable()
export class TransferEvidenceTransactionsService {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly allocations: IdempotencyAllocationStore,
    private readonly outbox: OutboxEventStore,
    private readonly authorizer: EvidenceAttemptAuthorizer,
    private readonly evidence: PaymentTransferEvidenceRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
  ) {}

  /**
   * Tx A — the object exists, so the row may now exist.
   *
   * The lane fixes kind and classification, so a caller cannot land a row in the
   * catalog lane or make its own screenshot public. `uploadedByCustomerId` is
   * the grant's customer (REL-033), copied from the authorization this request
   * already proved rather than from anything it sent.
   *
   * No `intakeProvenance`: `intake_expires_at` exists so an **unbound** APP5
   * attachment is swept after its challenge window, and this asset is bound in
   * Tx B moments later. Stamping an expiry on retained payment evidence would
   * schedule the cleanup of a record the Admin verification trail depends on.
   */
  async commitUploadedAsset(input: {
    readonly key: IdempotencyKey;
    readonly allocation: TransferEvidenceAllocation;
    readonly uploadedByCustomerId: string;
    readonly facts: TransferEvidenceFacts;
  }): Promise<Asset> {
    const { key, allocation, uploadedByCustomerId, facts } = input;

    return this.transactions.runInTransaction(async () => {
      await this.assertClaimHeld(key, allocation);

      const { asset, recovered } = await this.assets.registerOrRecover({
        id: allocation.assetId as AssetId,
        kind: TRANSFER_EVIDENCE_ASSET_KIND,
        classification: TRANSFER_EVIDENCE_CLASSIFICATION,
        storageKey: allocation.objectKey,
        mimeType: facts.mediaType,
        sizeBytes: BigInt(facts.byteSize),
        checksum: facts.checksum,
        uploadedByCustomerId,
      });

      // Two different files reaching one allocated identity has no safe
      // resolution, so it is refused rather than resolved in someone's favour.
      if (recovered && !matchesEvidenceFacts(asset, facts)) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }
      return asset;
    });
  }

  /**
   * Tx B — re-authorize, bound, bind, hand off. All or nothing.
   *
   * The order is not incidental. The grant and the attempt are re-established
   * first, under their own locks, so a link revoked or an attempt settled while
   * the bytes were in flight refuses here rather than at the earlier, unlocked
   * check. Only then is the bound counted, and only then is the row written —
   * every one of those statements inside the lock the count was taken under.
   *
   * There is no `try`/`catch` in this body and no compensation path: a failure
   * anywhere leaves no association, no inspection event and no completed record,
   * and every payment state exactly as it was.
   */
  async commitEvidenceBinding(input: {
    readonly key: IdempotencyKey;
    readonly allocation: TransferEvidenceAllocation;
    readonly token: string;
    readonly attemptId: string;
    readonly facts: TransferEvidenceFacts;
    readonly at: Date;
  }): Promise<TransferEvidenceCompleted> {
    const { key, allocation, token, attemptId, facts, at } = input;

    return this.transactions.runInTransaction(async () => {
      await this.assertClaimHeld(key, allocation);

      // Re-established under the row locks, not merely re-read: a grant revoked
      // or an attempt settled while ten megabytes were in flight must win.
      const authorized = await this.authorizer.authorize({
        token,
        attemptId,
        now: at,
        requireOpenAttempt: true,
      });

      // One read answers both questions the bound needs — how many are already
      // there, and whether this exact asset is one of them.
      const already = await this.evidence.listForAttempt(authorized.attempt.id);
      const isReplayOfThisAsset = already.some((row) => row.assetId === allocation.assetId);
      if (already.length >= MAX_EVIDENCE_PER_ATTEMPT && !isReplayOfThisAsset) {
        // The bound is checked before the insert and under the attempt's lock,
        // which is the only ordering that bounds two concurrent finalizations at
        // five. A crash-retry of an association that is already bound is
        // exempted: confirming an existing row adds nothing to the count, and
        // refusing it would turn a dropped response into a permanent failure.
        throw transferEvidenceError('EVIDENCE_QUOTA_REACHED');
      }

      const { association } = await this.evidence.bind({
        id: allocation.evidenceId as TransferEvidenceId,
        paymentAttemptId: authorized.attempt.id,
        assetId: allocation.assetId,
      });

      const asset = await this.assets.beginInspection(allocation.assetId as AssetId, at);
      if (asset === undefined || !matchesEvidenceFacts(asset, facts)) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }

      const inspectionEventId = await this.outbox.append({
        eventType: ASSET_INSPECTION_EVENT_TYPE,
        aggregateKind: 'ASSET',
        aggregateId: asset.id,
        payload: { schemaVersion: ASSET_INSPECTION_PAYLOAD_VERSION, assetId: asset.id },
        payloadSchemaVersion: ASSET_INSPECTION_PAYLOAD_VERSION,
      });

      const result = decodeTransferEvidenceCompleted({
        schemaVersion: TRANSFER_EVIDENCE_RESULT_SCHEMA_VERSION,
        kind: 'PAYMENT_TRANSFER_EVIDENCE_COMPLETED',
        assetId: allocation.assetId,
        evidenceId: association.id,
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
      return result;
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
    allocation: TransferEvidenceAllocation,
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
export function matchesEvidenceFacts(asset: Asset, facts: ConsumedFile): boolean {
  return (
    asset.mimeType === facts.mediaType &&
    asset.sizeBytes === BigInt(facts.byteSize) &&
    asset.checksum === facts.checksum &&
    asset.kind === TRANSFER_EVIDENCE_ASSET_KIND &&
    asset.classification === TRANSFER_EVIDENCE_CLASSIFICATION
  );
}
