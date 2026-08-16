/**
 * `TR-LC11-01` — the submission transaction (`APP5-G01` §4.3, `G01-D11`).
 *
 * One transaction spans four bounded contexts: Ordering writes the request root
 * and its children, Customer resolves the verified identity and issues the
 * grant, Design creates the case header and consumes the session, and Platform
 * arbitrates the claim and appends the outbox row. `TransactionManager` joins
 * rather than nests, so every collaborator below runs inside this one boundary
 * and a failure anywhere unwinds all of it.
 *
 * ### What "exactly one request" protects
 *
 * `G01-D11` lists the consequences a duplicate submit must not produce twice:
 * the request row, its code, the COP row, the quantity lines, the asset
 * bindings, the design case, the session's `ACTIVE → SUBMITTED` move, the
 * `REQUEST_ACCESS` grant with its notification, and the SE-003 outbox event.
 * Every one of them is written inside the claim below, so the database — the
 * `uq_idempotency_records__namespace_scope_key` arbiter — is what makes them
 * singular, not this file's belief about who else is running. There is no
 * process-local lock here and there must not be: one would be silent about the
 * second API replica.
 *
 * ### Nothing external is called inside it (INV-23)
 *
 * `SecureGrantIssuer.issue` mints, digests, persists and seals an envelope —
 * all database writes. Delivery is after-commit, by the APP4 worker draining the
 * outbox. No provider is contacted here, and request correctness does not depend
 * on one existing.
 *
 * ### Creation writes no transition row (`G01-D05`)
 *
 * `custom_request_transitions.from_status` is `NOT NULL` and CHECKed against the
 * LC-11 set, so a creation event has no legal `from` value. The request's
 * existence at `NEW` with its `created_at` **is** the creation fact; a
 * `NEW → NEW` self-loop would be a move that never happened. Accordingly this
 * use case never calls `transition()`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
import { IdempotencyStore, TransactionManager, type IdempotencyKey } from '@embroidery/persistence';

import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { SecureGrantIssuer } from '../../customer/application/secure-grant.issuer';
import type { CustomerId } from '../../customer/domain/repositories/customer.repository';
import {
  DESIGN_CASE_REPOSITORY,
  type DesignCaseId,
  type DesignCaseRepository,
} from '../../design/domain/repositories/design-case.repository';
import {
  DESIGN_SESSION_REPOSITORY,
  type DesignSession,
  type DesignSessionId,
  type DesignSessionRepository,
} from '../../design/domain/repositories/design-session.repository';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
  type QuantityBreakdownLine,
} from '../domain/repositories/custom-request.repository';
import { RequestSubmissionError } from '../domain/submission/request-submission.errors';
import { generateRequestCode } from '../domain/submission/request-code';
import {
  MAX_REQUEST_CODE_ATTEMPTS,
  REQUEST_SUBMIT_NAMESPACE,
  SUBMISSION_IDEMPOTENCY_TTL_MS,
} from '../domain/submission/request-submit-idempotency';
import { submissionFingerprint } from '../domain/submission/submission-fingerprint';
import {
  resolveSubmissionSubject,
  type SubjectCandidate,
  type SubmissionSubject,
} from '../domain/submission/submission-subject';
import { RequestAssetBinder, type RequestAssetBinding } from './request-asset-binder';
import { RequestSubmissionRecorder } from './request-submission.recorder';
import { SubmissionIdentityResolver } from './submission-identity.resolver';
import type { ChallengeId } from '../../customer/domain/repositories/verification-challenge.repository';

/** One intake quantity line as the caller states it. The variant is server-set. */
export interface SubmissionQuantityLine {
  readonly sizeLabel?: string | undefined;
  readonly quantity: number;
}

export interface SubmitCustomRequestCommand {
  /** The verified `SUBMISSION` challenge. The only identity input a client gives. */
  readonly challengeId: string;
  readonly subject: SubjectCandidate;
  readonly breakdown: readonly SubmissionQuantityLine[];
  readonly customerNote?: string | undefined;
  readonly assets: readonly RequestAssetBinding[];
  /**
   * The design session this caller proved it holds, resolved by the presentation
   * layer through APP3's own authorization service.
   *
   * A separate field from `subject.catalog.designSessionId` on purpose: that one
   * is request data, this one is the id a credential was actually verified for,
   * and the two are compared below. Absent on the COP branch, which has no
   * session and presents no ambient credential.
   */
  readonly authorizedSessionId?: string | undefined;
}

/** `G01` §4 — the stored and replayed result. Refs only, nothing secret-bearing. */
export interface SubmittedRequestResult {
  readonly requestId: string;
  readonly code: string;
  readonly status: string;
}

/** The `code` `uq_custom_requests__code` reports, per the constraint catalogue. */
const DUPLICATE_REQUEST_CODE = 'DUPLICATE_REQUEST_CODE';
/** `IdempotencyStore.claim`'s two guard codes. */
const IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT';
const IDEMPOTENCY_RECORD_VANISHED = 'IDEMPOTENCY_RECORD_VANISHED';
/** The guarded `ACTIVE → SUBMITTED` update reports this when it matches nothing. */
const SESSION_NOT_ACTIVE = 'SESSION_NOT_ACTIVE';

@Injectable()
export class SubmitCustomRequestUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly idempotency: IdempotencyStore,
    private readonly identities: SubmissionIdentityResolver,
    @Inject(CUSTOM_REQUEST_REPOSITORY) private readonly requests: CustomRequestRepository,
    @Inject(DESIGN_SESSION_REPOSITORY) private readonly sessions: DesignSessionRepository,
    @Inject(DESIGN_CASE_REPOSITORY) private readonly designCases: DesignCaseRepository,
    private readonly assets: RequestAssetBinder,
    private readonly grants: SecureGrantIssuer,
    private readonly recorder: RequestSubmissionRecorder,
    private readonly clock: AuditClock,
  ) {}

  async submit(command: SubmitCustomRequestCommand): Promise<SubmittedRequestResult> {
    const subject = resolveSubmissionSubject(command.subject);
    if (subject === undefined) {
      // Evaluated before the transaction opens, which is stronger than G01's
      // "before any write": there is no transaction to leave a partial one in.
      throw new RequestSubmissionError('SUBMISSION_SUBJECT_INVALID');
    }

    const breakdown = quantityLinesFor(subject, command.breakdown);
    const key: IdempotencyKey = {
      namespace: REQUEST_SUBMIT_NAMESPACE,
      scopeKey: command.challengeId,
      fingerprint: submissionFingerprint({ subject, breakdown }),
    };

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.runSubmission(key, subject, breakdown, command);
      } catch (error: unknown) {
        if (isCode(error, DUPLICATE_REQUEST_CODE) && attempt < MAX_REQUEST_CODE_ATTEMPTS) {
          continue;
        }
        throw this.classify(error);
      }
    }
  }

  /** One whole attempt. Commits every consequence, or none of them. */
  private async runSubmission(
    key: IdempotencyKey,
    subject: SubmissionSubject,
    breakdown: readonly QuantityBreakdownLine[],
    command: SubmitCustomRequestCommand,
  ): Promise<SubmittedRequestResult> {
    return this.transactions.runInTransaction(async () => {
      const now = this.clock.now();
      const customerId = await this.identities.resolve(command.challengeId as ChallengeId, now);

      const claim = await this.idempotency.claim(
        key,
        new Date(now.getTime() + SUBMISSION_IDEMPOTENCY_TTL_MS),
      );
      if (claim.outcome === 'replay') {
        // Completed earlier with this exact fingerprint. Nothing below runs, so
        // no second request, COP row, design case, session move, grant or event.
        return replayedResult(claim.result);
      }
      if (claim.outcome === 'in_progress') {
        throw new RequestSubmissionError('DUPLICATE_OPERATION');
      }

      const session =
        subject.branch === 'CATALOG'
          ? await this.loadSubmittable(subject, command, now)
          : undefined;

      const requestId = newId() as CustomRequestId;
      const created = await this.requests.submit({
        id: requestId,
        code: generateRequestCode(),
        customerId,
        ...(command.customerNote === undefined ? {} : { customerNote: command.customerNote }),
        ...(subject.branch === 'CATALOG'
          ? {
              productId: subject.productId,
              productVariantId: subject.productVariantId,
              // `G01-D09` — the session actually submitted, never a client value.
              submittedSessionId: session?.id,
            }
          : {
              // Spelled out rather than spread: the persistence contract states
              // every optional as `string | undefined`, so an *absent* key and an
              // undefined one are different types, and a spread would silently
              // stop compiling the day a field is added rather than mapped.
              customerOwnedProduct: {
                name: subject.product.name,
                description: subject.product.description,
                physicalWidthMm: subject.product.physicalWidthMm,
                physicalHeightMm: subject.product.physicalHeightMm,
              },
            }),
        breakdown,
      });

      await this.assets.bind({
        requestId,
        customerId,
        branch: subject.branch,
        bindings: command.assets,
      });

      // TR-LC11-01 creates the design **case header** and no version. A version
      // needs the four placement columns `NOT NULL`, which a COP request can
      // never supply — that limitation is an APP6-entry issue and is not solved,
      // worked around or touched here.
      await this.designCases.createForRequest(newId() as DesignCaseId, requestId);

      if (session !== undefined) {
        // The guarded update's own `status = 'ACTIVE'` predicate is the arbiter;
        // the read above is the friendly refusal.
        await this.sessions.submit(session.id, requestId, now);
      }

      // The customer's confirmation *is* the secure link (`G01-D05b`): issuing
      // the grant here produces exactly the notification SE-003's customer half
      // calls for, and its raw token never leaves the issuer's caller.
      await this.grants.issue({
        customerId: customerId as CustomerId,
        customRequestId: requestId,
        notify: true,
      });

      await this.recorder.record({
        customRequestId: requestId,
        subjectBranch: subject.branch,
      });

      // The returned row, not the values handed in: the code and status a replay
      // serves must be the ones the request actually carries.
      const result: SubmittedRequestResult = {
        requestId,
        code: created.code,
        status: created.status,
      };
      await this.idempotency.complete(key, result);
      return result;
    });
  }

  /**
   * GRD-027 — the session must be this caller's, live, and this subject's.
   *
   * Three independent facts, and none of them replaces another. The credential
   * was verified by APP3's authorization service in the presentation layer; the
   * liveness re-read happens here, inside the transaction, because that is where
   * it has to still be true; and the placement comparison is what stops a caller
   * from submitting their own live session against somebody else's product.
   *
   * ### Why the credential is checked *here*, after the claim
   *
   * A submission moves its session `ACTIVE → SUBMITTED`, and APP3's authorizer
   * refuses a session that is no longer live — so a caller retrying a submission
   * that already succeeded can never re-authorize it, and a credential check in
   * front of the claim would make every honest retry a `401` instead of the
   * replay the idempotency contract promises. Deferring it to the moment a
   * session is actually about to be **submitted** costs nothing: creation still
   * requires the credential in full, and a replay performs no session mutation
   * for a credential to authorize. A replaying caller also already holds the
   * verified challenge that authorized the original submission, so learning the
   * request id and code it produced discloses no capability it did not have.
   */
  private async loadSubmittable(
    subject: Extract<SubmissionSubject, { branch: 'CATALOG' }>,
    command: SubmitCustomRequestCommand,
    now: Date,
  ): Promise<DesignSession> {
    if (command.authorizedSessionId !== subject.designSessionId) {
      // The presentation layer verified a credential for some session, or for
      // none; either way it is not this one.
      throw new RequestSubmissionError('SESSION_NOT_AUTHORIZED');
    }

    const session = await this.sessions.findById(subject.designSessionId as DesignSessionId);
    if (
      session === undefined ||
      session.status !== 'ACTIVE' ||
      now >= session.expiresAt ||
      session.productId !== subject.productId ||
      (session.productVariantId !== undefined &&
        session.productVariantId !== subject.productVariantId)
    ) {
      throw new RequestSubmissionError('SESSION_EXPIRED');
    }
    return session;
  }

  /**
   * Translates the persistence verdicts this use case owns, and only those.
   *
   * Everything else — including a code collision that outlived its retries —
   * travels as itself to the platform filter, which sanitises it. Shaping an
   * unknown error into a bounded refusal here is how a defect would be reported
   * to a client as an ordinary "please fix your request".
   */
  private classify(error: unknown): unknown {
    if (isCode(error, IDEMPOTENCY_CONFLICT)) {
      return new RequestSubmissionError('IDEMPOTENCY_CONFLICT');
    }
    if (isCode(error, IDEMPOTENCY_RECORD_VANISHED)) {
      // The row conflicted a statement ago and was unreadable a statement later:
      // another attempt on this same challenge holds it. Reported as the
      // retryable in-progress outcome rather than as a server fault.
      return new RequestSubmissionError('DUPLICATE_OPERATION');
    }
    if (isCode(error, SESSION_NOT_ACTIVE)) {
      return new RequestSubmissionError('SESSION_EXPIRED');
    }
    return error;
  }
}

function isCode(error: unknown, code: string): boolean {
  return isPersistenceError(error) && error.code === code;
}

/**
 * The quantity lines, keyed as the schema keys them (`G01` §3).
 *
 * The **variant is server-set** from the request's own subject, never taken from
 * the line: `custom_request_quantity_breakdowns` keys lines by variant, and a
 * client-chosen one would let a submission price quantities against a variant it
 * did not order. On the COP branch there is no variant at all, so lines carry a
 * size label alone.
 */
function quantityLinesFor(
  subject: SubmissionSubject,
  lines: readonly SubmissionQuantityLine[],
): readonly QuantityBreakdownLine[] {
  if (subject.branch === 'CATALOG' && lines.length === 0) {
    // Required on the catalog branch: a catalog request with no quantities is
    // not quotable, and the subject invariant is where G01 puts that rule.
    throw new RequestSubmissionError('SUBMISSION_SUBJECT_INVALID');
  }
  return lines.map((line) => ({
    productVariantId: subject.branch === 'CATALOG' ? subject.productVariantId : undefined,
    sizeLabel: line.sizeLabel,
    quantity: line.quantity,
  }));
}

/**
 * Reads a stored result back, refusing anything that is not the G01 shape.
 *
 * A stored result is `jsonb` and therefore `unknown` on the way out. Trusting it
 * structurally would let a malformed record become a 200 describing a request
 * that does not exist, so a bad shape is a fault rather than a response.
 */
function replayedResult(stored: unknown): SubmittedRequestResult {
  if (typeof stored === 'object' && stored !== null) {
    const { requestId, code, status } = stored as Record<string, unknown>;
    if (typeof requestId === 'string' && typeof code === 'string' && typeof status === 'string') {
      return { requestId, code, status };
    }
  }
  throw new Error('A completed request.submit record does not carry a replayable result.');
}
