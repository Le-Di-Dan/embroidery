/**
 * The APP5 pre-submission customer upload (`APP5-G01` §7, `APP5-B02`).
 *
 * The whole request in one place: authorize the challenge, parse the multipart,
 * stream the bytes through to private storage while counting and verifying
 * them, then hand the result to the two durable transactions. The claim commits
 * **before** a single file byte is read — that ordering is what guarantees a
 * crash-retry recovers the same asset identity and the same object key instead
 * of minting a second one.
 *
 * Bytes go browser → API → storage and never touch a disk or a full in-memory
 * buffer. There is no presign, no browser storage credential and no second
 * operation to "complete" an upload (`IMP-D048` PO-01). Nothing in the response
 * names a bucket, a key, an inspector or a customer.
 *
 * ### The quota is checked twice, and only the second one decides
 *
 * The pre-stream check exists so a caller with no room left is refused before
 * uploading ten megabytes. It cannot be the arbiter: it commits, releases its
 * lock, and only then are the bytes read, so two callers can both pass it. Tx A
 * re-runs the check under the same lock that inserts the row, which is what
 * bounds the reservations at twenty.
 *
 * That leaves one case worth naming: Tx A can refuse *after* the object has
 * been written. The object is then removed here — this service allocated that
 * exact key, nothing else references it, and `deleteObject` is idempotent. It
 * is the same cleanup the aborted-multipart path already performs, not a new
 * deletion authority: an orphan with no asset row is invisible to the intake
 * sweep, which only ever finds objects through their rows.
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

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { assetIntakeError, isAssetIntakeError } from '../../../asset/domain/asset-intake.errors';
import {
  ALLOCATION_TTL_MS,
  UPLOAD_HARD_DURATION_MS,
  type AcceptedMediaType,
} from '../../../asset/domain/asset-intake.policy';
import { buildContentFingerprint } from '../../../asset/domain/intake-fingerprints';
import { IDEMPOTENCY_KEY_HEADER, parseIdempotencyKey } from '../../../asset/domain/idempotency-key';
import { sha256Hex } from '../../../asset/domain/canonical-json';
import { assertAcceptedMediaType } from '../../../asset/domain/media-signature';
import { normalizeFilename } from '../../../asset/domain/normalized-filename';
import {
  openMultipartUpload,
  type OpenedUpload,
} from '../../../asset/infrastructure/http/multipart-upload.parser';
import { consumeValidatedFile } from '../../../asset/infrastructure/http/validated-file.reader';
import {
  OBJECT_STORAGE,
  OBJECT_STORAGE_ENVIRONMENT,
} from '../../../asset/infrastructure/storage/object-storage.provider';
import { UploadTimer } from '../../../asset/application/ports/upload-timer';
import type { ChallengeId } from '../../../customer/domain/repositories/verification-challenge.repository';
import { buildRequestIntakeFingerprint } from '../../domain/intake/request-intake-fingerprint';
import {
  REQUEST_INTAKE_LANE,
  REQUEST_INTAKE_OPERATION_NAMESPACE,
  type RequestIntakeRole,
} from '../../domain/intake/request-intake.policy';
import {
  decodeRequestIntakeAllocation,
  decodeRequestIntakeCompleted,
  REQUEST_INTAKE_RESULT_SCHEMA_VERSION,
  type RequestIntakeAllocation,
  type RequestIntakeCompleted,
} from '../../domain/intake/request-intake-result.codec';
import { ChallengeIntakeAuthorizer } from './challenge-intake.authorizer';
import {
  RequestIntakeTransactionsService,
  type RequestIntakeFacts,
} from './request-intake-transactions.service';
import { toRequestIntakeView, type RequestIntakeView } from './request-intake-projection';

export interface RequestIntakeCommand {
  readonly challengeId: ChallengeId;
  readonly role: RequestIntakeRole;
}

interface Attempt {
  readonly opened: OpenedUpload;
  readonly key: IdempotencyKey;
  readonly declared: AcceptedMediaType;
  readonly signal: AbortSignal;
}

@Injectable()
export class RequestAssetIntakeService {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly allocations: IdempotencyAllocationStore,
    private readonly authorizer: ChallengeIntakeAuthorizer,
    private readonly commits: RequestIntakeTransactionsService,
    private readonly timer: UploadTimer,
    private readonly clock: AuditClock,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(OBJECT_STORAGE_ENVIRONMENT) private readonly environment: string,
  ) {}

  /** Owns the hard deadline, so parser, reader and upload all abort as one. */
  async upload(
    request: IncomingMessage,
    command: RequestIntakeCommand,
  ): Promise<RequestIntakeView> {
    const controller = new AbortController();
    const cancel = this.timer.schedule(UPLOAD_HARD_DURATION_MS, () => {
      controller.abort(assetIntakeError('ASSET_UPLOAD_TIMEOUT'));
    });
    try {
      return await this.dispatch(request, command, controller.signal);
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
    command: RequestIntakeCommand,
    signal: AbortSignal,
  ): Promise<RequestIntakeView> {
    const idempotencyKey = parseIdempotencyKey(request.headers[IDEMPOTENCY_KEY_HEADER]);
    // Scoped to the challenge, which is the credential: only the holder of the
    // challenge that authorized an upload is entitled to reuse its claim. The
    // digest is what keeps the challenge id itself out of `scope_key`.
    const scopeKey = sha256Hex(`app5-intake:${command.challengeId}:${idempotencyKey}`);

    // Before the body is touched. A caller whose challenge is spent, expired or
    // full learns so without uploading anything, and an unauthorized caller
    // never causes storage work.
    await this.transactions.runInTransaction(() =>
      this.authorizer.authorizeAndReserve(command.challengeId, this.clock.now()),
    );

    const opened = await openMultipartUpload(request, signal, REQUEST_INTAKE_LANE);
    const declared = assertAcceptedMediaType(opened.declaredMediaType);
    const key: IdempotencyKey = {
      namespace: REQUEST_INTAKE_OPERATION_NAMESPACE,
      scopeKey,
      fingerprint: buildRequestIntakeFingerprint({
        scopeKey,
        role: command.role,
        declaredMediaType: declared,
        normalizedFilename: normalizeFilename(opened.rawFilename),
      }),
    };
    const attempt: Attempt = { opened, key, declared, signal };
    const candidate = this.buildAllocation(command.role, declared);

    const claim = await this.transactions.runInTransaction(() =>
      this.allocations.claimWithAllocation({ key, result: candidate, ttlMs: ALLOCATION_TTL_MS }),
    );

    if (claim === 'conflict') {
      return this.rejectAfterDrain(attempt, 'IDEMPOTENCY_CONFLICT');
    }
    switch (claim.outcome) {
      case 'claimed':
        return this.streamFresh(attempt, candidate, command);
      case 'in_progress':
        return this.rejectAfterDrain(attempt, 'ASSET_UPLOAD_IN_PROGRESS');
      case 'completed':
        return this.replay(attempt, claim.result);
      case 'expired':
        // Refused, never reclaimed — the same decision `APP3-B06B` records: an
        // anonymous upload is cheap to retry, and reclaiming would mean deleting
        // an object allocated by a request this one cannot identify.
        return this.rejectAfterDrain(attempt, 'ASSET_UPLOAD_STATE_CONFLICT');
      default:
        return assertNever(claim);
    }
  }

  /** A fresh, application-owned identity: UUIDv7 id, derived key, random token. */
  private buildAllocation(
    role: RequestIntakeRole,
    declared: AcceptedMediaType,
  ): RequestIntakeAllocation {
    const assetId = newId();
    return decodeRequestIntakeAllocation({
      schemaVersion: REQUEST_INTAKE_RESULT_SCHEMA_VERSION,
      kind: 'CUSTOM_REQUEST_INTAKE_ALLOCATION',
      assetId,
      role,
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
   * loses the response, so the client would see a transport error instead of
   * the refusal that says what happened. The deadline still bounds the drain.
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
    allocation: RequestIntakeAllocation,
    command: RequestIntakeCommand,
  ): Promise<RequestIntakeView> {
    const facts = await this.streamToStorage(attempt, allocation);
    await attempt.opened.finish();

    const at = this.clock.now();
    try {
      await this.commits.commitReservedAsset({
        key: attempt.key,
        allocation,
        challengeId: command.challengeId,
        facts,
        at,
      });
    } catch (error: unknown) {
      // See the module comment: the row was refused, so nothing will ever point
      // at this object and no sweep can find it. Removing it is bounded to the
      // key this request allocated moments ago.
      await this.storage
        .deleteObject({ bucket: allocation.bucketAlias, key: allocation.objectKey })
        .catch(() => undefined);
      throw error;
    }

    const { result } = await this.commits.commitInspectionHandoff({
      key: attempt.key,
      allocation,
      facts,
      at,
    });
    return toRequestIntakeView(result);
  }

  /**
   * Streams the validated body into object storage in one pass.
   *
   * The `PassThrough` is the seam between parser and uploader: bytes are
   * written into it as they are validated and hashed, so no complete copy of
   * the file exists anywhere.
   */
  private async streamToStorage(
    attempt: Attempt,
    allocation: RequestIntakeAllocation,
  ): Promise<RequestIntakeFacts> {
    const body = new PassThrough();
    const upload = this.storage.putObjectStream({
      bucket: 'ORIGINALS',
      key: allocation.objectKey,
      body,
      contentType: attempt.declared,
      signal: attempt.signal,
    });
    // Attached immediately: if the reader fails first it destroys `body`, and
    // an unobserved rejection here would crash the process rather than surface
    // as the reader's error.
    const settled = upload.then(
      () => undefined,
      (error: unknown) => error,
    );

    let facts: RequestIntakeFacts;
    try {
      const consumed = await consumeValidatedFile({
        source: attempt.opened.stream,
        declaredMediaType: attempt.declared,
        sink: body,
        signal: attempt.signal,
        maxBytes: REQUEST_INTAKE_LANE.maxUploadBytes,
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
   * without a single object write, and the answer comes from the stored record.
   * A replay performs no reservation: the slot this upload holds was taken
   * once, by the attempt that created the row.
   */
  private async replay(attempt: Attempt, storedResult: unknown): Promise<RequestIntakeView> {
    const stored = decodeCompletedOrConflict(storedResult);
    const consumed = await consumeValidatedFile({
      source: attempt.opened.stream,
      declaredMediaType: attempt.declared,
      signal: attempt.signal,
      maxBytes: REQUEST_INTAKE_LANE.maxUploadBytes,
    });
    await attempt.opened.finish();

    if (buildContentFingerprint(consumed) !== stored.contentFingerprint) {
      throw assetIntakeError('IDEMPOTENCY_CONFLICT');
    }
    return toRequestIntakeView(stored);
  }
}

function decodeCompletedOrConflict(value: unknown): RequestIntakeCompleted {
  try {
    return decodeRequestIntakeCompleted(value);
  } catch {
    // A stored record this operation cannot read is not this request's to
    // reinterpret; refusing beats answering from a shape we do not understand.
    throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled idempotency claim outcome: ${JSON.stringify(value)}`);
}
