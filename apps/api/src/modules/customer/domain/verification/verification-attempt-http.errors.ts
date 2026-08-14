/**
 * The public answers the attempt endpoint may give (`APP4-B04`).
 *
 * A separate table from `verification-http.errors.ts` rather than three more
 * rows in it: that file is `APP4-B03`'s published refusal contract and its
 * exhaustive `Record<VerificationIssueFailure, …>` is what stops a new issue
 * failure from being added without a status. Widening it with answers that only
 * the attempt path can produce would blur which endpoint each row belongs to.
 *
 * Three statuses, and the boundary between them is the rule:
 *
 * - **422** — the code was wrong, or the challenge cannot be answered. About
 *   this caller's own challenge and their own typing.
 * - **429** — the attempt budget for this challenge is spent. About this
 *   caller's own recent behaviour, which is what `GRD-026` calls
 *   `RATE_LIMITED`.
 * - **503** — the server cannot complete a verification it has already
 *   accepted. About the server.
 *
 * As in B03, none of them depends on **who owns the destination**: there is no
 * `CUSTOMER_NOT_FOUND` and no variant reachable only for a contact that belongs
 * to somebody. `CHALLENGE_NOT_ANSWERABLE` covers an unknown id and a closed one
 * alike, so a guessed id cannot be confirmed by the shape of the refusal.
 *
 * No message names the code, the digest, the contact or the attempt count. A
 * "3 attempts remaining" message would be a free oracle over how much budget an
 * attacker has left, and the client already knows how many times it has asked.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

import type { VerificationAttemptFailure } from './verification-attempt-outcome';

/** The submitted code did not match, and the challenge is still answerable. */
export function verificationCodeMismatch(): HttpException {
  return new HttpException(
    { message: 'That code is not correct.' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/** The challenge is closed, expired, unknown, or already answered. */
export function verificationChallengeNotAnswerable(): HttpException {
  return new HttpException(
    { message: 'That verification challenge can no longer be answered.' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/** The attempt budget for this challenge is spent; the challenge is FAILED. */
export function verificationAttemptsExhausted(): HttpException {
  return new HttpException(
    { message: 'Too many incorrect codes. Please request a new one.' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/** The verification succeeded but its identity could not be established. */
function identityNotResolvable(): HttpException {
  return new HttpException(
    { message: 'That verification could not be completed.' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/**
 * Two passes lost the same identity race.
 *
 * 503 rather than 409: nothing about the request is wrong and nothing about the
 * conflict is the caller's to resolve, so the honest answer is "not now". A 409
 * would also invite a client to retry immediately against the very contention
 * that produced it.
 */
function verificationConflictUnresolved(): HttpException {
  return new HttpException(
    { message: 'Verification is temporarily unavailable.' },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

const RESPONSE_OF: Readonly<Record<VerificationAttemptFailure, () => HttpException>> = {
  IDENTITY_NOT_RESOLVABLE: identityNotResolvable,
  VERIFICATION_CONFLICT_UNRESOLVED: verificationConflictUnresolved,
};

export function verificationAttemptFailureResponse(
  failure: VerificationAttemptFailure,
): HttpException {
  return RESPONSE_OF[failure]();
}
