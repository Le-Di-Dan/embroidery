/**
 * The anonymous Session raster intake (`APP3-B06B`, `IMP-D048` PO-01).
 *
 * The whole request in one place: parse the multipart, stream the bytes through
 * to private storage while counting and verifying them, then hand the result to
 * the durable transaction. The claim commits **before** a single file byte is
 * read — that ordering is what guarantees a crash-retry recovers the same asset
 * identity and the same object key instead of minting a second one.
 *
 * Bytes go browser → API → storage and never touch a disk or a full in-memory
 * buffer. There is no presign, no browser storage credential and no second
 * operation to "complete" an upload: `IMP-D048` PO-01 fixed that, and a
 * completion proof the client sends is a proof the client can forge.
 *
 * An **expired** allocation is refused rather than reclaimed. `APP2-B01`'s
 * reclaim path exists because an Admin upload is expensive to lose and its
 * owner is authenticated; an anonymous Session upload is neither, and reclaiming
 * would mean reaching into the Asset module's internal reclaim service and
 * deleting objects allocated by a request this one cannot identify. Refusing
 * costs the caller one retry with a fresh key and leaves the abandoned object to
 * the existing orphan sweep, which is the one component allowed to decide an
 * object has no owner.
 */
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { newId } from '@embroidery/database';
import {
  IdempotencyAllocationStore,
  TransactionManager,
  type IdempotencyKey,
} from '@embroidery/persistence';
import {
  buildOriginalObjectKey,
  type ObjectStorageEnvironment,
  type ObjectStoragePort,
} from '@embroidery/object-storage';

import { assetIntakeError, isAssetIntakeError } from '../../asset/domain/asset-intake.errors';
import {
  UPLOAD_HARD_DURATION_MS,
  type AcceptedMediaType,
} from '../../asset/domain/asset-intake.policy';
import { ALLOCATION_TTL_MS } from '../../asset/domain/asset-intake.policy';
import {
  buildContentFingerprint,
  buildRequestFingerprint,
} from '../../asset/domain/intake-fingerprints';
import {
  IDEMPOTENCY_KEY_HEADER,
  buildScopeKey,
  parseIdempotencyKey,
} from '../../asset/domain/idempotency-key';
import { assertAcceptedMediaType } from '../../asset/domain/media-signature';
import { normalizeFilename } from '../../asset/domain/normalized-filename';
import {
  openMultipartUpload,
  type OpenedUpload,
} from '../../asset/infrastructure/http/multipart-upload.parser';
import { consumeValidatedFile } from '../../asset/infrastructure/http/validated-file.reader';
import {
  OBJECT_STORAGE,
  OBJECT_STORAGE_ENVIRONMENT,
} from '../../asset/infrastructure/storage/object-storage.provider';
import { UploadTimer } from '../../asset/application/ports/upload-timer';
import {
  DESIGN_SESSION_INTAKE_LANE,
  SESSION_REVISION_HEADER,
  SESSION_UPLOAD_OPERATION_NAMESPACE,
} from '../domain/session-asset-intake.policy';
import {
  decodeSessionAllocation,
  decodeSessionCompleted,
  SESSION_UPLOAD_RESULT_SCHEMA_VERSION,
  type SessionUploadAllocation,
  type SessionUploadCompleted,
} from '../domain/session-upload-result.codec';
import {
  SessionAssetTransactionsService,
  type SessionDurableFacts,
} from './session-asset-transactions.service';
import type { SessionAssetIntakeView } from './session-asset-projection';
import { toSessionAssetView } from './session-asset-projection';

interface Attempt {
  readonly opened: OpenedUpload;
  readonly key: IdempotencyKey;
  readonly declared: AcceptedMediaType;
  readonly signal: AbortSignal;
}

@Injectable()
export class SessionAssetIntakeService {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly allocations: IdempotencyAllocationStore,
    private readonly commits: SessionAssetTransactionsService,
    private readonly timer: UploadTimer,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(OBJECT_STORAGE_ENVIRONMENT) private readonly environment: string,
  ) {}

  /** Owns the hard deadline, so parser, reader and upload all abort as one. */
  async upload(request: IncomingMessage, sessionId: string): Promise<SessionAssetIntakeView> {
    const controller = new AbortController();
    const cancel = this.timer.schedule(UPLOAD_HARD_DURATION_MS, () => {
      controller.abort(assetIntakeError('ASSET_UPLOAD_TIMEOUT'));
    });
    try {
      return await this.dispatch(request, sessionId, controller.signal);
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
    sessionId: string,
    signal: AbortSignal,
  ): Promise<SessionAssetIntakeView> {
    const expectedRevision = parseExpectedRevision(request.headers[SESSION_REVISION_HEADER]);
    const idempotencyKey = parseIdempotencyKey(request.headers[IDEMPOTENCY_KEY_HEADER]);
    // Scoped to the session, not to a network key: the credential that proves
    // ownership is the only thing entitled to reuse an in-flight claim.
    const scopeKey = buildScopeKey(sessionId, idempotencyKey);

    const opened = await openMultipartUpload(request, signal, DESIGN_SESSION_INTAKE_LANE);
    const declared = assertAcceptedMediaType(opened.declaredMediaType);
    const key: IdempotencyKey = {
      namespace: SESSION_UPLOAD_OPERATION_NAMESPACE,
      scopeKey,
      fingerprint: buildRequestFingerprint({
        scopeKey,
        declaredMediaType: declared,
        normalizedFilename: normalizeFilename(opened.rawFilename),
      }),
    };
    const attempt: Attempt = { opened, key, declared, signal };
    const candidate = this.buildAllocation(sessionId, declared);

    const claim = await this.transactions.runInTransaction(() =>
      this.allocations.claimWithAllocation({ key, result: candidate, ttlMs: ALLOCATION_TTL_MS }),
    );

    if (claim === 'conflict') {
      return this.rejectAfterDrain(attempt, 'IDEMPOTENCY_CONFLICT');
    }
    switch (claim.outcome) {
      case 'claimed':
        return this.streamFresh(attempt, candidate, expectedRevision);
      case 'in_progress':
        return this.rejectAfterDrain(attempt, 'ASSET_UPLOAD_IN_PROGRESS');
      case 'completed':
        return this.replay(attempt, claim.result);
      case 'expired':
        // See the module comment: refused, never reclaimed.
        return this.rejectAfterDrain(attempt, 'ASSET_UPLOAD_STATE_CONFLICT');
      default:
        return assertNever(claim);
    }
  }

  /** A fresh, application-owned identity: UUIDv7 id, derived key, random token. */
  private buildAllocation(sessionId: string, declared: AcceptedMediaType): SessionUploadAllocation {
    const assetId = newId();
    return decodeSessionAllocation({
      schemaVersion: SESSION_UPLOAD_RESULT_SCHEMA_VERSION,
      kind: 'DESIGN_SESSION_UPLOAD_ALLOCATION',
      assetId,
      sessionId,
      bucketAlias: 'ORIGINALS',
      objectKey: buildOriginalObjectKey({
        environment: this.environment as ObjectStorageEnvironment,
        assetId,
        contentType: declared,
      }),
      claimToken: randomUUID(),
    });
  }

  /**
   * Refuses without processing the file.
   *
   * The body is drained rather than the socket destroyed: a destroyed socket
   * loses the response, so the client would see a transport error instead of the
   * 409 that says what happened. The deadline still bounds the drain.
   */
  private async rejectAfterDrain(
    attempt: Attempt,
    code: 'IDEMPOTENCY_CONFLICT' | 'ASSET_UPLOAD_IN_PROGRESS' | 'ASSET_UPLOAD_STATE_CONFLICT',
  ): Promise<never> {
    attempt.opened.stream.resume();
    await attempt.opened.finish().catch(() => undefined);
    throw assetIntakeError(code);
  }

  /** The happy path: object first, then the two durable transactions. */
  private async streamFresh(
    attempt: Attempt,
    allocation: SessionUploadAllocation,
    expectedRevision: number,
  ): Promise<SessionAssetIntakeView> {
    const facts = await this.streamToStorage(attempt, allocation);
    await attempt.opened.finish();

    await this.commits.commitUploadedAsset({ key: attempt.key, allocation, facts });
    const { result } = await this.commits.commitSessionIntake({
      key: attempt.key,
      allocation,
      facts,
      expectedRevision,
      at: new Date(),
    });
    return toSessionAssetView(result);
  }

  /**
   * Streams the validated body into object storage in one pass.
   *
   * The `PassThrough` is the seam between parser and uploader: bytes are written
   * into it as they are validated and hashed, so no complete copy of the file
   * exists anywhere.
   */
  private async streamToStorage(
    attempt: Attempt,
    allocation: SessionUploadAllocation,
  ): Promise<SessionDurableFacts> {
    const body = new PassThrough();
    const upload = this.storage.putObjectStream({
      bucket: 'ORIGINALS',
      key: allocation.objectKey,
      body,
      contentType: attempt.declared,
      signal: attempt.signal,
    });
    // Attached immediately: if the reader fails first it destroys `body`, and an
    // unobserved rejection here would crash the process rather than surface as
    // the reader's error.
    const settled = upload.then(
      () => undefined,
      (error: unknown) => error,
    );

    let facts: SessionDurableFacts;
    try {
      const consumed = await consumeValidatedFile({
        source: attempt.opened.stream,
        declaredMediaType: attempt.declared,
        sink: body,
        signal: attempt.signal,
        maxBytes: DESIGN_SESSION_INTAKE_LANE.maxUploadBytes,
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
   * A completed key replays only when the resent bytes are the same bytes.
   *
   * The body is re-read with no sink at all, so the replay is content-complete
   * without a single object write, and the answer comes from the stored record
   * rather than a fresh read — re-reading the session would report a *later*
   * revision and make one key return two different answers.
   */
  private async replay(attempt: Attempt, storedResult: unknown): Promise<SessionAssetIntakeView> {
    const stored = decodeSessionCompletedOrConflict(storedResult);
    const consumed = await consumeValidatedFile({
      source: attempt.opened.stream,
      declaredMediaType: attempt.declared,
      signal: attempt.signal,
      maxBytes: DESIGN_SESSION_INTAKE_LANE.maxUploadBytes,
    });
    await attempt.opened.finish();

    const fingerprint = buildContentFingerprint(consumed);
    if (fingerprint !== stored.contentFingerprint) {
      throw assetIntakeError('IDEMPOTENCY_CONFLICT');
    }
    return toSessionAssetView(stored);
  }
}

function decodeSessionCompletedOrConflict(value: unknown): SessionUploadCompleted {
  try {
    return decodeSessionCompleted(value);
  } catch {
    // A stored record this operation cannot read is not this request's to
    // reinterpret; refusing beats answering from a shape we do not understand.
    throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled idempotency claim outcome: ${JSON.stringify(value)}`);
}

function parseExpectedRevision(raw: string | string[] | undefined): number {
  // A repeated header arrives as an array; the first value is the only one this
  // contract recognises, and a malformed one is refused rather than coerced.
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) {
    throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
  }
  return Number.parseInt(value, 10);
}
