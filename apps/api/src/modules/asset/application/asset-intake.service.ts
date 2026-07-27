/**
 * The asset-intake state machine (`ADR-APP2-001` §4.2f, `APP2-B01` §12-§18).
 *
 * One request takes exactly one of five paths, decided by what the durable
 * allocation claim finds:
 *
 *   claimed    → stream to storage, Tx A, Tx B
 *   in_progress→ 409, no second object
 *   conflict   → 409, no object, no stored result disclosed
 *   completed  → re-read and re-verify the whole body, write nothing, replay
 *   expired    → reclaim, then resume from durable asset truth
 *
 * The claim commits **before** a single file byte is read. That ordering is the
 * design: it is what guarantees a crash-retry recovers the same asset identity
 * and the same object key instead of minting a second one.
 *
 * Delivery is at-least-once with an idempotent durable effect. Exactly-once is
 * not claimed and is not achievable across a database and an object store.
 */
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { newId } from '@embroidery/database';
import {
  IdempotencyAllocationStore,
  OutboxEventStore,
  TransactionManager,
  type IdempotencyKey,
} from '@embroidery/persistence';
import {
  buildOriginalObjectKey,
  type ObjectStorageEnvironment,
  type ObjectStoragePort,
} from '@embroidery/object-storage';

import { assetIntakeError, isAssetIntakeError } from '../domain/asset-intake.errors';
import {
  ALLOCATION_TTL_MS,
  ASSET_INSPECTION_EVENT_TYPE,
  INTAKE_ASSET_KIND,
  INTAKE_CLASSIFICATION,
  UPLOAD_HARD_DURATION_MS,
  UPLOAD_OPERATION_NAMESPACE,
  type AcceptedMediaType,
} from '../domain/asset-intake.policy';
import { buildContentFingerprint, buildRequestFingerprint } from '../domain/intake-fingerprints';
import {
  IDEMPOTENCY_KEY_HEADER,
  buildScopeKey,
  parseIdempotencyKey,
} from '../domain/idempotency-key';
import { assertAcceptedMediaType } from '../domain/media-signature';
import { normalizeFilename } from '../domain/normalized-filename';
import {
  decodeAllocation,
  decodeCompleted,
  UPLOAD_RESULT_SCHEMA_VERSION,
  type AssetUploadAllocation,
  type AssetUploadCompleted,
} from '../domain/upload-result.codec';
import {
  ASSET_REPOSITORY,
  type AssetId,
  type AssetRepository,
} from '../domain/repositories/asset.repository';
import {
  openMultipartUpload,
  type OpenedUpload,
} from '../infrastructure/http/multipart-upload.parser';
import { consumeValidatedFile } from '../infrastructure/http/validated-file.reader';
import {
  OBJECT_STORAGE,
  OBJECT_STORAGE_ENVIRONMENT,
} from '../infrastructure/storage/object-storage.provider';
import { toUploadReceipt, type AssetUploadReceipt } from './asset-projection';
import { UploadTimer } from './ports/upload-timer';
import { UploadReclaimService } from './upload-reclaim.service';
import {
  matchesDurableFacts,
  UploadTransactionsService,
  type DurableFacts,
} from './upload-transactions.service';

interface UploadAttempt {
  readonly opened: OpenedUpload;
  readonly key: IdempotencyKey;
  readonly declared: AcceptedMediaType;
  readonly signal: AbortSignal;
}

@Injectable()
export class AssetIntakeService {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly allocations: IdempotencyAllocationStore,
    private readonly outbox: OutboxEventStore,
    private readonly reclaim: UploadReclaimService,
    private readonly commits: UploadTransactionsService,
    private readonly timer: UploadTimer,
    @Inject(ASSET_REPOSITORY) private readonly repository: AssetRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(OBJECT_STORAGE_ENVIRONMENT) private readonly environment: string,
  ) {}

  /**
   * The single entry point. Owns the hard-duration deadline so every downstream
   * stage — parser, reader, storage upload — aborts from one signal.
   */
  async upload(request: IncomingMessage, actorId: string): Promise<AssetUploadReceipt> {
    const controller = new AbortController();
    const cancel = this.timer.schedule(UPLOAD_HARD_DURATION_MS, () => {
      controller.abort(assetIntakeError('ASSET_UPLOAD_TIMEOUT'));
    });
    try {
      return await this.dispatch(request, actorId, controller.signal);
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        controller.abort(error);
      }
      throw error;
    } finally {
      cancel();
    }
  }

  private async dispatch(
    request: IncomingMessage,
    actorId: string,
    signal: AbortSignal,
  ): Promise<AssetUploadReceipt> {
    const idempotencyKey = parseIdempotencyKey(request.headers[IDEMPOTENCY_KEY_HEADER]);
    const scopeKey = buildScopeKey(actorId, idempotencyKey);

    const opened = await openMultipartUpload(request, signal);
    const declared = assertAcceptedMediaType(opened.declaredMediaType);
    const key: IdempotencyKey = {
      namespace: UPLOAD_OPERATION_NAMESPACE,
      scopeKey,
      fingerprint: buildRequestFingerprint({
        scopeKey,
        declaredMediaType: declared,
        normalizedFilename: normalizeFilename(opened.rawFilename),
      }),
    };
    const attempt: UploadAttempt = { opened, key, declared, signal };
    const candidate = this.buildAllocation(declared);

    const claim = await this.transactions.runInTransaction(() =>
      this.allocations.claimWithAllocation({ key, result: candidate, ttlMs: ALLOCATION_TTL_MS }),
    );

    if (claim === 'conflict') {
      return this.rejectAfterDrain(attempt, 'IDEMPOTENCY_CONFLICT');
    }
    switch (claim.outcome) {
      case 'claimed':
        return this.streamFreshUpload(attempt, candidate);
      case 'in_progress':
        return this.rejectAfterDrain(attempt, 'ASSET_UPLOAD_IN_PROGRESS');
      case 'completed':
        return this.replayCompleted(attempt, claim.result);
      case 'expired':
        return this.resumeExpired(attempt, claim.result);
      default:
        // Unreachable: the union above is closed. Present so a new outcome is a
        // compile error here rather than a silently unhandled request.
        return assertNever(claim);
    }
  }

  /** A fresh, application-owned identity: UUIDv7 id, derived key, random token. */
  private buildAllocation(declared: AcceptedMediaType): AssetUploadAllocation {
    const assetId = newId();
    return decodeAllocation({
      schemaVersion: UPLOAD_RESULT_SCHEMA_VERSION,
      kind: 'ASSET_UPLOAD_ALLOCATION',
      assetId,
      bucketAlias: 'ORIGINALS',
      objectKey: buildOriginalObjectKey({
        environment: this.environment as ObjectStorageEnvironment,
        assetId,
        contentType: declared,
      }),
      claimToken: randomUUID(),
      requestFingerprintVersion: 1,
    });
  }

  /**
   * Refuses without processing the file.
   *
   * The body is drained rather than the socket destroyed: a destroyed socket
   * loses the response, so the client would see a transport error instead of
   * the 409 that tells it what actually happened. The hard-duration deadline
   * still bounds the drain.
   */
  private async rejectAfterDrain(
    attempt: UploadAttempt,
    code: 'IDEMPOTENCY_CONFLICT' | 'ASSET_UPLOAD_IN_PROGRESS',
  ): Promise<never> {
    attempt.opened.stream.resume();
    await attempt.opened.finish().catch(() => undefined);
    throw assetIntakeError(code);
  }

  /** The happy path: object first, then the two durable transactions. */
  private async streamFreshUpload(
    attempt: UploadAttempt,
    allocation: AssetUploadAllocation,
  ): Promise<AssetUploadReceipt> {
    const facts = await this.streamToStorage(attempt, allocation);
    await attempt.opened.finish();

    await this.commits.commitUploadedAsset({ key: attempt.key, allocation, facts });
    const { asset } = await this.commits.commitInspectionHandoff({
      key: attempt.key,
      allocation,
      facts,
      at: new Date(),
    });
    return toUploadReceipt(asset);
  }

  /**
   * Streams the validated body into object storage in one pass.
   *
   * The `PassThrough` is the seam between the parser and `lib-storage`: bytes
   * are written into it as they are validated and hashed, so no complete copy
   * of the file exists anywhere.
   */
  private async streamToStorage(
    attempt: UploadAttempt,
    allocation: AssetUploadAllocation,
  ): Promise<DurableFacts> {
    const body = new PassThrough();
    const upload = this.storage.putObjectStream({
      bucket: 'ORIGINALS',
      key: allocation.objectKey,
      body,
      contentType: attempt.declared,
      signal: attempt.signal,
    });
    // Attached immediately: if the reader fails first it destroys `body`, and
    // an unobserved rejection here would crash the process instead of
    // surfacing as the reader's error.
    const settled = upload.then(
      () => undefined,
      (error: unknown) => error,
    );

    let facts: DurableFacts;
    try {
      const consumed = await consumeValidatedFile({
        source: attempt.opened.stream,
        declaredMediaType: attempt.declared,
        sink: body,
        signal: attempt.signal,
      });
      facts = { ...consumed, contentFingerprint: buildContentFingerprint(consumed) };
    } catch (error: unknown) {
      await settled;
      throw error;
    }

    const uploadError = await settled;
    if (uploadError !== undefined) {
      throw isAssetIntakeError(uploadError)
        ? uploadError
        : assetIntakeError('ASSET_STORAGE_UNAVAILABLE');
    }
    return facts;
  }

  /**
   * Re-reads the body with no sink at all, so a replay is content-complete
   * without a single object write.
   */
  private async verifyResentBody(attempt: UploadAttempt): Promise<DurableFacts> {
    const consumed = await consumeValidatedFile({
      source: attempt.opened.stream,
      declaredMediaType: attempt.declared,
      signal: attempt.signal,
    });
    const facts = { ...consumed, contentFingerprint: buildContentFingerprint(consumed) };
    await attempt.opened.finish();
    return facts;
  }

  /** A completed key replays only when the resent bytes are the same bytes. */
  private async replayCompleted(
    attempt: UploadAttempt,
    storedResult: unknown,
  ): Promise<AssetUploadReceipt> {
    const stored = decodeCompleted(storedResult);
    const facts = await this.verifyResentBody(attempt);
    if (facts.contentFingerprint !== stored.contentFingerprint) {
      throw assetIntakeError('IDEMPOTENCY_CONFLICT');
    }
    return receiptFromCompleted(stored);
  }

  /**
   * Takes over an expired allocation, then resumes from whatever the durable
   * asset truth turns out to be — never from what the previous attempt hoped.
   */
  private async resumeExpired(
    attempt: UploadAttempt,
    storedResult: unknown,
  ): Promise<AssetUploadReceipt> {
    const reclaimed = await this.reclaim.reclaimExpired(attempt.key, storedResult);
    if (reclaimed === 'lost') {
      // Another reclaimer holds a fresh lease; this request is now the duplicate.
      return this.rejectAfterDrain(attempt, 'ASSET_UPLOAD_IN_PROGRESS');
    }

    const asset = await this.repository.findById(reclaimed.assetId as AssetId);
    if (asset === undefined) {
      await this.reclaim.cleanupAbandonedObjects({
        storage: this.storage,
        environment: this.environment,
        allocation: reclaimed,
        signal: attempt.signal,
      });
      await this.reclaim.assertStillOwned(attempt.key, reclaimed);
      return this.streamFreshUpload(attempt, reclaimed);
    }

    const facts = await this.verifyResentBody(attempt);
    if (!matchesDurableFacts(asset, facts)) {
      throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
    }

    if (asset.status === 'UPLOADED') {
      const { asset: inspecting } = await this.commits.commitInspectionHandoff({
        key: attempt.key,
        allocation: reclaimed,
        facts,
        at: new Date(),
      });
      return toUploadReceipt(inspecting);
    }

    if (asset.status === 'INSPECTING' || asset.status === 'ACCEPTED') {
      // The handoff already happened; the receipt is reconstructed from the
      // intent that proves it, never asserted because the state looks right.
      const intents = await this.outbox.listForAggregate('ASSET', asset.id);
      // The earliest matching intent is the one the original completed result
      // would have carried; a later duplicate would be a different failure.
      const eventId = intents.find((event) => event.eventType === ASSET_INSPECTION_EVENT_TYPE)?.id;
      if (eventId === undefined) {
        throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
      }
      await this.commits.completeFromExistingIntent({
        key: attempt.key,
        allocation: reclaimed,
        facts,
        eventId,
      });
      return toUploadReceipt(asset);
    }

    // REJECTED, DELETION_PENDING, DELETED — no upload may resume from these.
    throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled idempotency claim outcome: ${JSON.stringify(value)}`);
}

/**
 * The replay receipt, built from the stored result alone.
 *
 * No database read: the stored result is the receipt the first attempt already
 * returned, and re-reading the row could report a *later* lifecycle state,
 * which would make one idempotency key return two different answers.
 */
function receiptFromCompleted(stored: AssetUploadCompleted): AssetUploadReceipt {
  return {
    assetId: stored.assetId,
    kind: INTAKE_ASSET_KIND,
    classification: INTAKE_CLASSIFICATION,
    status: stored.assetStatus,
    mediaType: stored.mediaType,
    byteSize: stored.byteSize,
    checksum: stored.checksum,
  };
}
