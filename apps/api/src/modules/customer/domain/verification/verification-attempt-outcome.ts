/**
 * What answering a challenge can produce (`APP4-B04`).
 *
 * Four outcomes and three refusals, and the split between them is the whole
 * transactional design of this checkpoint.
 *
 * **An outcome is returned, not thrown.** Three of the four are refusals from
 * the caller's point of view, and every one of them has already written durable
 * evidence — a `MISMATCH` row, an `EXPIRED_AT_ENTRY` row, an `ISSUED → FAILED`
 * transition. Throwing them would roll the transaction back and destroy exactly
 * the record that makes the attempt budget real: a wrong code that leaves no
 * attempt row is a wrong code that never happened, and the fifth guess would be
 * free forever. So the use case returns, the transaction commits, and the
 * controller turns the outcome into a status. Only a failure that *must* undo
 * its transaction is thrown.
 *
 * **Nothing here carries the code, the digest, the contact or the customer.**
 * The outcome says what happened to the challenge and nothing about who owns
 * the destination — the same `ADR-APP4-001` §1.3 rule 4 property `APP4-B03`'s
 * issue outcome has, for the same reason.
 */
import type { ChallengeId } from '../repositories/verification-challenge.repository';

/** The code matched a live challenge, which is now consumed. */
export const VERIFIED = 'VERIFIED';
/** The code was wrong and the challenge still has budget left. */
export const MISMATCH = 'MISMATCH';
/**
 * The code was wrong and that attempt spent the last of the budget.
 *
 * Distinct from {@link MISMATCH} because the client's next step differs: there
 * is nothing left to retype, and the only way forward is a new challenge.
 */
export const LOCKED = 'LOCKED';
/**
 * The challenge cannot take an answer at all.
 *
 * One outcome for every reason — no such id, already verified, already failed,
 * cancelled, expired, or timed out with no sweep yet. They are deliberately not
 * separated: an id that answers differently depending on *why* it is closed is
 * an id an attacker can probe, and a caller holding a real challenge learns
 * nothing useful from the distinction either.
 */
export const NOT_ANSWERABLE = 'NOT_ANSWERABLE';

export interface VerificationAttemptAccepted {
  readonly outcome: typeof VERIFIED;
  readonly challengeId: ChallengeId;
  /** Unchanged by verification: expiry is absolute (`ADR-APP4-001` §1.3 r2). */
  readonly expiresAt: Date;
}

export interface VerificationAttemptRefused {
  readonly outcome: typeof MISMATCH | typeof LOCKED | typeof NOT_ANSWERABLE;
}

export type VerificationAttemptResult = VerificationAttemptAccepted | VerificationAttemptRefused;

export const VERIFICATION_ATTEMPT_FAILURES = [
  /**
   * The identity behind a verified `SUBMISSION` could not be established.
   *
   * Covers every bounded `APP4-B02` conflict that is not the concurrency loss
   * B04 retries: a contact owned by another customer, a merged owner, a
   * `verified_source` the contract refuses. One class, because each of them
   * describes *someone else's* identity and separating them would report on it.
   */
  'IDENTITY_NOT_RESOLVABLE',
  /**
   * Two passes both lost the CST-005 race.
   *
   * Bounded on purpose (`APP4-B04` §13): the retry exists to absorb a genuine
   * concurrent verification of the same contact, and a second loss means
   * something other than the ordinary race is happening. Retrying further would
   * be an open-ended loop against a live database.
   */
  'VERIFICATION_CONFLICT_UNRESOLVED',
] as const;

export type VerificationAttemptFailure = (typeof VERIFICATION_ATTEMPT_FAILURES)[number];

/**
 * The one error the attempt capability raises.
 *
 * The message is the failure code and nothing else — the same rule
 * `VerificationIssueError` follows, and for the same reason: everything that
 * would make a richer message is the contact, the constraint or the driver's
 * `DETAIL`.
 */
export class VerificationAttemptError extends Error {
  readonly failure: VerificationAttemptFailure;

  constructor(failure: VerificationAttemptFailure) {
    super(failure);
    this.name = 'VerificationAttemptError';
    this.failure = failure;
  }
}

export function isVerificationAttemptFailure(error: unknown): error is VerificationAttemptError {
  return error instanceof VerificationAttemptError;
}
