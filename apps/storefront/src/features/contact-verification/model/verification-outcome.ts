/**
 * Turning an API refusal into an approved screen (`APP4-S01` §16).
 *
 * **Mapped by HTTP status, never by message text.** Every function here reads
 * `NormalizedApiError.httpStatus`; none reads `.message`, which is prose the
 * server is free to reword.
 *
 * The awkward part is that status alone is not always enough, and that is a
 * property of the backend contract rather than an oversight. `APP4-B03` and
 * `APP4-B04` attach no business error code to their refusals, so the envelope
 * carries the status-derived default and two genuinely different outcomes share
 * one code:
 *
 * ```text
 * 422 on an attempt  →  wrong code  OR  challenge no longer answerable
 * 429 on an attempt  →  attempt budget spent
 * 422 on a resend    →  challenge no longer resendable
 * ```
 *
 * `APP4-B04` refuses to separate them on purpose: an id that answers differently
 * is an id an attacker can confirm. So an ambiguous refusal is resolved by
 * **reading the challenge's own state once** — the narrow status read §16
 * authorizes — rather than by guessing or by parsing a sentence. That read is
 * the only reason `publicVerificationReadStatus` is on this feature's boundary.
 */
import { VerificationChallengeStatusResponseState } from '@embroidery/api-client';
import type { NormalizedApiError } from '@embroidery/api-client';

/** What the screen should do next, in the vocabulary of the approved frames. */
export type IssueOutcome =
  'INVALID_CONTACT' | 'CHANNEL_UNSUPPORTED' | 'RATE_LIMITED' | 'RECOVERABLE_ERROR';

export type AttemptOutcome =
  'MISMATCH' | 'EXPIRED' | 'LOCKED' | 'SUCCESS' | 'RATE_LIMITED' | 'RECOVERABLE_ERROR';

export type ResendOutcome =
  'CHALLENGE_DEAD' | 'CHANNEL_UNSUPPORTED' | 'RATE_LIMITED' | 'RECOVERABLE_ERROR';

const UNPROCESSABLE = 422;
const TOO_MANY_REQUESTS = 429;
const SERVICE_UNAVAILABLE = 503;

/**
 * Issue and resend refusals that are about the caller's own recent behaviour.
 *
 * 429 and 503 map to the same approved frame (`625:173`, "Rate limited /
 * temporarily unavailable"), which is correct: both mean "not now, and nothing
 * about your input is wrong", and the design draws one screen for them.
 */
function isBackOff(status: number | undefined): boolean {
  return status === TOO_MANY_REQUESTS || status === SERVICE_UNAVAILABLE;
}

/**
 * The one refusal on this path that *is* separated by a business code.
 *
 * `APP12-N01` locked customer verification to email. A contact kind that is not
 * a verification channel is refused with 422 and this classification — the same
 * 422 an unusable email gets, which is why the code and not the status is what
 * tells them apart. Reading it is the difference between telling the customer
 * "that address is malformed" and telling them the truth: codes are sent by
 * email.
 *
 * **This branch is defence in depth, and is expected never to fire from this
 * UI.** `N01.S01` removed every control capable of naming a non-email channel,
 * and the generated request type now admits one member, so the Storefront
 * cannot construct such a request. It is retained because a refusal that
 * *does* arrive — a legacy `PHONE` challenge resent by an old open tab, a
 * future caller — must not be rendered as a spelling mistake.
 *
 * A second limitation, stated rather than hidden: the API attaches this code to
 * the failure it raises internally but publishes the envelope with the
 * status-derived default, so today the branch is unreachable *by code* as well
 * as by construction. Making the envelope carry it is a backend change `S01`
 * is not authorized to make — recorded as `FU-APP12-N01-S01-01`.
 */
const CHANNEL_UNSUPPORTED_CODE = 'VERIFICATION_CHANNEL_UNSUPPORTED';

/** `POST /public/verification/challenges` refused. */
export function issueOutcomeOf(error: NormalizedApiError): IssueOutcome {
  if (error.code === CHANNEL_UNSUPPORTED_CODE) return 'CHANNEL_UNSUPPORTED';
  if (error.httpStatus === UNPROCESSABLE) return 'INVALID_CONTACT';
  if (isBackOff(error.httpStatus)) return 'RATE_LIMITED';
  return 'RECOVERABLE_ERROR';
}

/**
 * `POST …/{challengeId}/resend` refused.
 *
 * A 422 means the source cannot be resent — unknown, answered, failed, expired
 * or already replaced, all one refusal by design. The screen cannot tell the
 * customer which without asking, so the caller resolves it through the status
 * read; `CHALLENGE_DEAD` is that instruction, not a rendered state.
 */
export function resendOutcomeOf(error: NormalizedApiError): ResendOutcome {
  // The resend path is the one place a *legacy* `PHONE` challenge could still
  // be named — the id already exists, so nothing about the request states a
  // channel. `N01.B01` put the refusal in the domain precisely so this call is
  // refused too; classifying it here keeps the answer honest instead of
  // resolving it as an ordinary dead challenge.
  if (error.code === CHANNEL_UNSUPPORTED_CODE) return 'CHANNEL_UNSUPPORTED';
  if (error.httpStatus === UNPROCESSABLE) return 'CHALLENGE_DEAD';
  if (isBackOff(error.httpStatus)) return 'RATE_LIMITED';
  return 'RECOVERABLE_ERROR';
}

/**
 * `POST …/{challengeId}/attempts` refused, with the challenge's own state.
 *
 * `state` is `undefined` when the follow-up read itself failed. That is not a
 * verdict about the challenge, so it degrades to the recoverable-error frame
 * rather than inventing a lockout the server never reported.
 */
export function attemptOutcomeOf(
  error: NormalizedApiError,
  state: VerificationChallengeStatusResponseState | undefined,
): AttemptOutcome {
  if (state === VerificationChallengeStatusResponseState.VERIFIED) return 'SUCCESS';
  if (state === VerificationChallengeStatusResponseState.FAILED) return 'LOCKED';
  if (
    state === VerificationChallengeStatusResponseState.EXPIRED ||
    state === VerificationChallengeStatusResponseState.CANCELLED
  ) {
    return 'EXPIRED';
  }
  // Still ISSUED: the challenge is alive, so a 422 was the code being wrong and
  // a 429 was this challenge's attempt budget running out.
  if (state === VerificationChallengeStatusResponseState.ISSUED) {
    return error.httpStatus === TOO_MANY_REQUESTS ? 'LOCKED' : 'MISMATCH';
  }
  // No state to read. Fall back to what the status alone can support.
  if (error.httpStatus === TOO_MANY_REQUESTS) return 'LOCKED';
  return 'RECOVERABLE_ERROR';
}

/** Which terminal screen a dead challenge resolves to after a resend refusal. */
export function deadChallengeOutcome(
  state: VerificationChallengeStatusResponseState | undefined,
): 'EXPIRED' | 'LOCKED' | 'SUCCESS' | 'RECOVERABLE_ERROR' {
  if (state === VerificationChallengeStatusResponseState.VERIFIED) return 'SUCCESS';
  if (state === VerificationChallengeStatusResponseState.FAILED) return 'LOCKED';
  if (state === undefined) return 'RECOVERABLE_ERROR';
  return 'EXPIRED';
}
