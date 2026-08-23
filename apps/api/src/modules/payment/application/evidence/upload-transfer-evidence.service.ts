/**
 * The customer's transfer-evidence upload (`APP7-G01` §7, `APP7-B05`).
 *
 * The order of one request, in one place, and it is the delivered intake
 * pipeline with one lane swapped in: parse the multipart, take the credential
 * from the fields that arrived before the file, authorize the exact attempt,
 * claim the idempotency scope, stream the bytes through to private storage while
 * counting, hashing and signature-checking them, then hand the result to the two
 * durable transactions. No second parser, no second reader, no second storage
 * client, no presign, no browser storage credential and no "complete this
 * upload" call.
 *
 * Everything that touches object storage lives in
 * {@link TransferEvidenceObjectWriter}; everything durable lives in
 * {@link TransferEvidenceTransactionsService}. What is left here is the
 * sequence, which is the part that has to be read as a sequence.
 *
 * ### The credential arrives in the body, which fixes the order of everything
 *
 * The three shipped lanes authorize *before* touching the body, because their
 * credential is in a path or a header. This one cannot: `ADR-APP4-001` §11 makes
 * the secure-link token a body-only carrier. So the parser runs first — and only
 * as far as the two credential fields, because `openMultipartUpload` resolves at
 * the file part with the stream unread and Busboy stalled. Nothing expensive has
 * happened at that point: not one byte of the image has been read, nothing has
 * been written, and the abuse budget is charged before either.
 *
 * ### The bound is checked twice, and only the second one decides
 *
 * The pre-stream check exists so a caller with no room left is refused before
 * uploading ten megabytes. It cannot be the arbiter: it commits, releases the
 * attempt lock, and only then are the bytes read, so two callers can both pass
 * it. Tx B re-takes that lock, re-counts and inserts under it, which is what
 * bounds an attempt at five.
 *
 * ### A bound refused after the object was written
 *
 * Tx B can refuse when the race is genuinely lost — and, unlike the APP5 lane,
 * the asset row is already committed by then, because `APP7-B05` §11 puts the
 * quota in Tx B rather than Tx A. The result is exactly the state the delivered
 * orphan authority already owns: an `UPLOADED` asset with no association, which
 * is the IDX-086 recovery window the intake sweep finds through its row. No
 * ad-hoc synchronous deletion is issued for it (`APP7-B05` §29) — the object is
 * still referenced by a real row, so deleting it would be deleting a live
 * asset's binary. A **Tx A** failure is the opposite case and keeps the
 * delivered cleanup, because nothing was committed to point at the object.
 *
 * ### Nothing here can move money
 *
 * This service reaches one asset writer, one association writer and one outbox.
 * It holds no obligation writer, no order repository and no provider client, so
 * an attempt cannot be settled, an obligation satisfied, an order moved or a
 * reconciliation appended — the property is the wiring's, not this file's.
 */
import { Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import {
  IdempotencyAllocationStore,
  PaymentTransferEvidenceRepository,
  TransactionManager,
  type IdempotencyKey,
} from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { assetIntakeError } from '../../../asset/domain/asset-intake.errors';
import {
  ALLOCATION_TTL_MS,
  UPLOAD_HARD_DURATION_MS,
  type AcceptedMediaType,
} from '../../../asset/domain/asset-intake.policy';
import { IDEMPOTENCY_KEY_HEADER, parseIdempotencyKey } from '../../../asset/domain/idempotency-key';
import { assertAcceptedMediaType } from '../../../asset/domain/media-signature';
import { normalizeFilename } from '../../../asset/domain/normalized-filename';
import {
  openMultipartUpload,
  type OpenedUpload,
} from '../../../asset/infrastructure/http/multipart-upload.parser';
import { UploadTimer } from '../../../asset/application/ports/upload-timer';
import {
  readTransferEvidenceCredential,
  type TransferEvidenceCredential,
} from '../../domain/evidence/transfer-evidence-credential';
import {
  buildTransferEvidenceFingerprint,
  transferEvidenceScopeKey,
} from '../../domain/evidence/transfer-evidence-fingerprint';
import {
  decodeTransferEvidenceCompleted,
  type TransferEvidenceAllocation,
  type TransferEvidenceCompleted,
} from '../../domain/evidence/transfer-evidence-result.codec';
import { transferEvidenceError } from '../../domain/evidence/transfer-evidence.errors';
import {
  MAX_EVIDENCE_PER_ATTEMPT,
  PAYMENT_EVIDENCE_INTAKE_LANE,
  TRANSFER_EVIDENCE_ATTEMPT_FIELD,
  TRANSFER_EVIDENCE_OPERATION_NAMESPACE,
  TRANSFER_EVIDENCE_TOKEN_FIELD,
} from '../../domain/evidence/transfer-evidence.policy';
import {
  EvidenceAttemptAuthorizer,
  type AuthorizedEvidenceAttempt,
} from './evidence-attempt.authorizer';
import { TransferEvidenceObjectWriter } from './transfer-evidence-object.writer';
import { TransferEvidenceTransactionsService } from './transfer-evidence-transactions.service';
import type { TransferEvidenceUploadView } from './transfer-evidence.view';

/** What {@link UploadTransferEvidenceService.prepare} proved and computed. */
interface Prepared {
  readonly credential: TransferEvidenceCredential;
  readonly declared: AcceptedMediaType;
  readonly key: IdempotencyKey;
  readonly authorized: AuthorizedEvidenceAttempt;
}

/** One claimed attempt at streaming, with the identity it will land under. */
interface ClaimedUpload extends Prepared {
  readonly opened: OpenedUpload;
  readonly signal: AbortSignal;
  readonly allocation: TransferEvidenceAllocation;
}

@Injectable()
export class UploadTransferEvidenceService {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly allocations: IdempotencyAllocationStore,
    private readonly authorizer: EvidenceAttemptAuthorizer,
    private readonly evidence: PaymentTransferEvidenceRepository,
    private readonly objects: TransferEvidenceObjectWriter,
    private readonly commits: TransferEvidenceTransactionsService,
    private readonly timer: UploadTimer,
    private readonly clock: AuditClock,
  ) {}

  /**
   * Owns the hard deadline, so parser, reader and upload all abort as one.
   *
   * `admit` is the delivered public admission — the abuse budget, the
   * fail-closed policy read and the digest — passed in rather than injected,
   * because charging it needs the token and setting `Retry-After` needs the HTTP
   * response, and only the controller holds the second.
   */
  async upload(
    request: IncomingMessage,
    admit: (token: string) => Promise<void>,
  ): Promise<TransferEvidenceUploadView> {
    const controller = new AbortController();
    const cancel = this.timer.schedule(UPLOAD_HARD_DURATION_MS, () => {
      controller.abort(assetIntakeError('ASSET_UPLOAD_TIMEOUT'));
    });
    try {
      return await this.dispatch(request, admit, controller.signal);
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
    admit: (token: string) => Promise<void>,
    signal: AbortSignal,
  ): Promise<TransferEvidenceUploadView> {
    const idempotencyKey = parseIdempotencyKey(request.headers[IDEMPOTENCY_KEY_HEADER]);
    const opened = await openMultipartUpload(request, signal, PAYMENT_EVIDENCE_INTAKE_LANE);

    // Everything between the file part appearing and the claim can refuse, and
    // every one of those refusals happens with the body still stalled. Draining
    // matters as much as the refusal: a client whose socket was simply dropped
    // sees a transport error instead of the answer that says what happened.
    let prepared: Prepared;
    try {
      prepared = await this.prepare(opened, admit, idempotencyKey);
    } catch (error: unknown) {
      await drain(opened);
      throw error;
    }

    const allocation = this.objects.allocate(prepared.declared);
    const claim = await this.transactions.runInTransaction(() =>
      this.allocations.claimWithAllocation({
        key: prepared.key,
        result: allocation,
        ttlMs: ALLOCATION_TTL_MS,
      }),
    );

    if (claim === 'conflict') {
      return rejectAfterDrain(opened, 'IDEMPOTENCY_CONFLICT');
    }
    switch (claim.outcome) {
      case 'claimed':
        return this.streamFresh({ ...prepared, opened, signal, allocation });
      case 'in_progress':
        return rejectAfterDrain(opened, 'ASSET_UPLOAD_IN_PROGRESS');
      case 'completed':
        return this.replay(opened, prepared.declared, signal, claim.result);
      case 'expired':
        // Refused, never reclaimed — the decision `APP3-B06B` and `APP5-B02`
        // both record: reclaiming would mean deleting an object allocated by a
        // request this one cannot identify, and a customer upload is cheap to
        // retry under a new key.
        return rejectAfterDrain(opened, 'ASSET_UPLOAD_STATE_CONFLICT');
      default:
        return assertNever(claim);
    }
  }

  /**
   * Everything that must be true, and everything that must be computed, before
   * one byte of the image is read.
   *
   * The order is the security argument. The credential's *shape* first, because
   * an unparsable token costs nothing to refuse. The abuse budget second, so a
   * caller guessing tokens is charged before it causes any work. Then the full
   * chain and the bound, inside one transaction that takes the grant and attempt
   * row locks — and commits, releasing them. That last part is why this is
   * explicitly **not** the arbiter of anything: it refuses the hopeless case
   * cheaply, and Tx B, holding those same locks, decides.
   */
  private async prepare(
    opened: OpenedUpload,
    admit: (token: string) => Promise<void>,
    idempotencyKey: string,
  ): Promise<Prepared> {
    const credential = readTransferEvidenceCredential(
      opened.fields,
      TRANSFER_EVIDENCE_TOKEN_FIELD,
      TRANSFER_EVIDENCE_ATTEMPT_FIELD,
    );
    await admit(credential.token);

    const authorized = await this.transactions.runInTransaction(async () => {
      const proved = await this.authorizer.authorize({
        token: credential.token,
        attemptId: credential.attemptId,
        now: this.clock.now(),
        requireOpenAttempt: true,
      });
      if ((await this.evidence.countForAttempt(proved.attempt.id)) >= MAX_EVIDENCE_PER_ATTEMPT) {
        throw transferEvidenceError('EVIDENCE_QUOTA_REACHED');
      }
      return proved;
    });

    const declared = assertAcceptedMediaType(opened.declaredMediaType);
    const scopeKey = transferEvidenceScopeKey({
      // The proved chain, never the values the body asserted.
      customRequestId: authorized.customRequestId,
      paymentAttemptId: authorized.attempt.id,
      idempotencyKey,
    });
    return {
      credential,
      declared,
      authorized,
      key: {
        namespace: TRANSFER_EVIDENCE_OPERATION_NAMESPACE,
        scopeKey,
        fingerprint: buildTransferEvidenceFingerprint({
          scopeKey,
          declaredMediaType: declared,
          normalizedFilename: normalizeFilename(opened.rawFilename),
        }),
      },
    };
  }

  /** The happy path: object first, then the two durable transactions. */
  private async streamFresh(upload: ClaimedUpload): Promise<TransferEvidenceUploadView> {
    const facts = await this.objects.write({
      source: upload.opened.stream,
      declared: upload.declared,
      allocation: upload.allocation,
      signal: upload.signal,
    });
    await upload.opened.finish();

    const at = this.clock.now();
    try {
      await this.commits.commitUploadedAsset({
        key: upload.key,
        allocation: upload.allocation,
        uploadedByCustomerId: upload.authorized.customerId,
        facts,
      });
    } catch (error: unknown) {
      // Nothing was committed, so nothing will ever point at this object and no
      // sweep can find it.
      await this.objects.removeOrphan(upload.allocation);
      throw error;
    }

    const result = await this.commits.commitEvidenceBinding({
      key: upload.key,
      allocation: upload.allocation,
      token: upload.credential.token,
      attemptId: upload.credential.attemptId,
      facts,
      at,
    });
    return toUploadView(result, false);
  }

  /**
   * A completed key replays only when the resent bytes are the same bytes.
   *
   * The body is re-read with no sink at all, so the replay is content-complete
   * without a single object write, and the answer comes from the stored record.
   * One asset, one association, one inspection event — all of them the ones the
   * winning attempt already wrote.
   */
  private async replay(
    opened: OpenedUpload,
    declared: AcceptedMediaType,
    signal: AbortSignal,
    storedResult: unknown,
  ): Promise<TransferEvidenceUploadView> {
    const stored = decodeCompletedOrConflict(storedResult);
    const fingerprint = await this.objects.fingerprintOnly({
      source: opened.stream,
      declared,
      signal,
    });
    await opened.finish();

    if (fingerprint !== stored.contentFingerprint) {
      throw assetIntakeError('IDEMPOTENCY_CONFLICT');
    }
    return toUploadView(stored, true);
  }
}

/**
 * Reads the rest of the body and discards it, so a refusal can be delivered.
 *
 * The body is drained rather than the socket destroyed: a destroyed socket loses
 * the response, so the client would see a transport error instead of the refusal
 * that says what happened. The deadline still bounds the drain, and a failure
 * while draining is swallowed deliberately — the refusal already being thrown is
 * the one worth reporting.
 */
async function drain(opened: OpenedUpload): Promise<void> {
  opened.stream.resume();
  await opened.finish().catch(() => undefined);
}

async function rejectAfterDrain(
  opened: OpenedUpload,
  code: 'IDEMPOTENCY_CONFLICT' | 'ASSET_UPLOAD_IN_PROGRESS' | 'ASSET_UPLOAD_STATE_CONFLICT',
): Promise<never> {
  await drain(opened);
  throw assetIntakeError(code);
}

function toUploadView(
  result: TransferEvidenceCompleted,
  replayed: boolean,
): TransferEvidenceUploadView {
  return {
    evidenceId: result.evidenceId,
    // Fixed rather than re-read, and honest rather than lazy: this view is only
    // ever built from a record Tx B wrote, and Tx B's whole job is to move the
    // asset there. It never claims ACCEPTED, verified or paid — none of which an
    // upload establishes. Anything later is the status operation's answer.
    assetStatus: 'INSPECTING',
    mediaType: result.mediaType,
    byteSize: result.byteSize,
    replayed,
  };
}

function decodeCompletedOrConflict(value: unknown): TransferEvidenceCompleted {
  try {
    return decodeTransferEvidenceCompleted(value);
  } catch {
    // A stored record this operation cannot read is not this request's to
    // reinterpret; refusing beats answering from a shape we do not understand.
    throw assetIntakeError('ASSET_UPLOAD_STATE_CONFLICT');
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled idempotency claim outcome: ${JSON.stringify(value)}`);
}
