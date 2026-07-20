/**
 * AGG-03 Verification Challenge persistence contract (TBL-006, TBL-007).
 *
 * Carries G-DB7-41 (a challenge belongs to the contact and purpose being
 * verified), G-DB7-43 (the step-up window) and G-DB7-45 (attempt counting;
 * the rate *policy* is layered on top, and the concurrent behaviour is DB8's).
 */
import type {
  ContactKind,
  VerificationAttemptOutcome,
  VerificationPurpose,
} from '@embroidery/database';

export type ChallengeId = string & { readonly __brand: 'ChallengeId' };

export interface VerificationChallenge {
  readonly id: ChallengeId;
  readonly contactKind: ContactKind;
  readonly normalizedValue: string;
  readonly purpose: VerificationPurpose;
  readonly expiresAt: Date;
  readonly verifiedAt: Date | undefined;
}

export interface OpenChallengeInput {
  readonly id: ChallengeId;
  readonly contactKind: ContactKind;
  readonly normalizedValue: string;
  readonly purpose: VerificationPurpose;
  /** A hash of the one-time code — never the code (`09-SECURITY` §OTP). */
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly contactPointId?: string | undefined;
}

export const VERIFICATION_CHALLENGE_REPOSITORY = Symbol('VERIFICATION_CHALLENGE_REPOSITORY');

export interface VerificationChallengeRepository {
  /** @requiresTransaction */
  openChallenge(input: OpenChallengeInput): Promise<VerificationChallenge>;

  /**
   * Appends an attempt. Evidence, so it is never updated in place.
   *
   * @requiresTransaction — an attempt and the state change it causes belong
   * to one transaction.
   */
  recordAttempt(
    challengeId: ChallengeId,
    outcome: VerificationAttemptOutcome,
    at: Date,
  ): Promise<void>;

  /** @requiresTransaction */
  completeChallenge(id: ChallengeId, verifiedAt: Date): Promise<VerificationChallenge>;

  /** @requiresTransaction */
  failChallenge(id: ChallengeId): Promise<void>;

  /**
   * The open challenge for a contact and purpose, if one is live.
   *
   * Returns nothing once expired, so an expired challenge cannot be answered
   * merely because no sweep has run. G-DB7-41.
   */
  resolveOpen(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<VerificationChallenge | undefined>;

  /** Attempts against one challenge — the input to the rate policy (G-DB7-45). */
  countAttempts(challengeId: ChallengeId): Promise<number>;

  /**
   * Whether a step-up verification completed inside the window (G-DB7-43).
   *
   * The window itself is a policy value read from configuration, not a
   * constant here.
   */
  hasRecentCompleted(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    notBefore: Date,
  ): Promise<boolean>;

  findById(id: ChallengeId): Promise<VerificationChallenge | undefined>;
}
