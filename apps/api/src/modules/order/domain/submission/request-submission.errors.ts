/**
 * The bounded refusals `POST /api/public/custom-requests` may give
 * (`APP5-G01` §9.3).
 *
 * Every code below is inherited from the guard catalogue or added by G01 under
 * its naming; none is invented here. They travel in the standard error envelope
 * as stable business codes (`BACKEND_CONVENTIONS` §6), which the platform
 * mapper promotes from the exception payload's `code`.
 *
 * ### Every refusal throws
 *
 * Unlike `APP4-B04`, a refused submission has **no evidence to commit** — G01
 * `G01-D05` gives creation no transition row, and a refused submission creates
 * no request, no COP row, no design case, no grant and no outbox event. So a
 * refusal is an error that rolls the transaction back, which is also what
 * guarantees the partial-write acceptance criterion: there is nothing to unwind
 * because nothing was allowed to commit.
 *
 * ### What no message says
 *
 * No message names a customer, a contact value, a challenge, a session secret, a
 * grant, a storage key, an asset's owner or an internal reason class. A caller
 * learns which rule it broke and nothing about rows it was never shown.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const SUBMISSION_FAILURES = [
  /** `G01` §3 — both branches present, or neither. */
  'SUBMISSION_SUBJECT_INVALID',
  /** GRD-001 — no live, verified, `SUBMISSION`-purpose challenge backs this call. */
  'CUSTOMER_NOT_VERIFIED',
  /** The caller does not hold the credential for the session it named. */
  'SESSION_NOT_AUTHORIZED',
  /** GRD-027 — the session is not ACTIVE, or is not this subject's session. */
  'SESSION_EXPIRED',
  /** `G01` §6 — an asset is missing, wrong-role, wrong-branch, unaccepted or reused. */
  'REQUEST_ASSET_NOT_BINDABLE',
  /** GRD-030 — the same challenge was already used for a different submission. */
  'IDEMPOTENCY_CONFLICT',
  /** GRD-012 — another attempt on this challenge is mid-flight. Retryable. */
  'DUPLICATE_OPERATION',
] as const;

export type SubmissionFailure = (typeof SUBMISSION_FAILURES)[number];

export class RequestSubmissionError extends Error {
  constructor(readonly failure: SubmissionFailure) {
    super(`Custom request submission refused: ${failure}`);
    this.name = 'RequestSubmissionError';
  }
}

export function isRequestSubmissionError(error: unknown): error is RequestSubmissionError {
  return error instanceof RequestSubmissionError;
}

interface PublicRefusal {
  readonly status: HttpStatus;
  readonly message: string;
}

/**
 * The published answer for each failure.
 *
 * `422` for a rule the submission itself breaks, `409` for the two idempotency
 * outcomes — which are about a *previous* call on the same challenge, not about
 * this body, and which a client resolves by reading the first result rather than
 * by editing anything.
 */
const REFUSAL_OF: Readonly<Record<SubmissionFailure, PublicRefusal>> = {
  SUBMISSION_SUBJECT_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'A request must have exactly one subject: a catalog product or your own product.',
  },
  CUSTOMER_NOT_VERIFIED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'That contact verification cannot be used to submit a request.',
  },
  SESSION_NOT_AUTHORIZED: {
    // The wording APP3 uses, deliberately: an unknown session id, a wrong
    // secret and a missing cookie must stay one indistinguishable answer.
    status: HttpStatus.UNAUTHORIZED,
    message: 'That design session could not be authorized.',
  },
  SESSION_EXPIRED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'That design session can no longer be submitted.',
  },
  REQUEST_ASSET_NOT_BINDABLE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'One of the attached images cannot be used for this request.',
  },
  IDEMPOTENCY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'This verification was already used to submit a different request.',
  },
  DUPLICATE_OPERATION: {
    status: HttpStatus.CONFLICT,
    message: 'This submission is already being processed. Please try again in a moment.',
  },
};

export function submissionFailureResponse(failure: SubmissionFailure): HttpException {
  const refusal = REFUSAL_OF[failure];
  return new HttpException({ code: failure, message: refusal.message }, refusal.status);
}
