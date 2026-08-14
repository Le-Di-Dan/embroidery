/**
 * What challenge issuance and business resend can produce (`APP4-B03`).
 *
 * One success shape and a closed set of refusals. The success shape is the same
 * for a freshly created challenge and for one that already existed, because the
 * caller must not be able to tell those apart either — a client that could see
 * "this was new" would learn whether someone else had recently asked for a code
 * for that address.
 *
 * Nothing here carries a code, a digest, a contact value, a customer reference,
 * a SQLSTATE or a constraint name. The refusals describe **the caller's own
 * request** — malformed input, too soon, too many — and never anything about who
 * owns the target (`ADR-APP4-001` §1.3 rule 4).
 */
import type { ChallengeId } from '../repositories/verification-challenge.repository';

/** A challenge was created by this call. */
export const ISSUED = 'ISSUED';
/**
 * A live challenge already existed and is being returned unchanged.
 *
 * The initial-issue endpoint deliberately does **not** rotate it: doing so would
 * mint a code on every call and let a client bypass the resend cooldown simply
 * by using the other endpoint (`APP4-B03` §7).
 */
export const ALREADY_OPEN = 'ALREADY_OPEN';

export interface VerificationChallengeIssued {
  readonly outcome: typeof ISSUED | typeof ALREADY_OPEN;
  readonly challengeId: ChallengeId;
  readonly expiresAt: Date;
  /** So a client never hard-codes the cooldown (`APP4-B03` §6). */
  readonly resendAvailableAt: Date;
}

export const VERIFICATION_ISSUE_FAILURES = [
  /** The contact could not be normalized into a canonical target. */
  'CONTACT_NOT_ACCEPTABLE',
  /** The published `verification.challenge` policy is missing or malformed. */
  'VERIFICATION_POLICY_UNAVAILABLE',
  /** `maxIssuesPerTargetPerWindow` is spent for this target and purpose. */
  'ISSUANCE_RATE_EXCEEDED',
  /** The resend cooldown has not elapsed for the source challenge. */
  'RESEND_TOO_SOON',
  /**
   * The named challenge cannot be resent.
   *
   * One class for every reason: it does not exist, it was answered, it failed,
   * it expired, it was already replaced. Separating them would turn the resend
   * route into an oracle over challenge ids — a caller could learn that an id it
   * guessed was real, and then watch its state.
   */
  'CHALLENGE_NOT_RESENDABLE',
  /** A referenced Design Session does not exist (REL-007). */
  'SESSION_REFERENCE_INVALID',
  /**
   * CST-007 refused the insert: another transaction opened a challenge for the
   * same target and purpose between this one's lookup and its insert.
   *
   * Reachable only if the advisory lock was not taken — the arbiter of last
   * resort, kept because a future caller that forgets the lock must fail rather
   * than silently produce a second open challenge.
   */
  'CONCURRENT_ISSUE_LOSS',
] as const;

export type VerificationIssueFailure = (typeof VERIFICATION_ISSUE_FAILURES)[number];

/**
 * The one error the issue and resend capabilities raise.
 *
 * The message is the failure code and nothing else. Everything that would make a
 * richer message — the contact, the constraint, the driver's `DETAIL`, the
 * challenge's real state — is exactly what must not travel.
 */
export class VerificationIssueError extends Error {
  readonly failure: VerificationIssueFailure;

  constructor(failure: VerificationIssueFailure) {
    super(failure);
    this.name = 'VerificationIssueError';
    this.failure = failure;
  }
}

export function isVerificationIssueFailure(error: unknown): error is VerificationIssueError {
  return error instanceof VerificationIssueError;
}
