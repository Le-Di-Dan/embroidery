/**
 * Shared harness for the `APP4-B04` attempt and status suites.
 *
 * Built on the delivered `APP4-B03` fixture rather than beside it: the two
 * checkpoints answer the same challenges, and a second boot of the same module
 * with a slightly different clock or minter is how two suites start proving
 * things about two different systems. This adds the B04 capabilities resolved
 * from that same container, and one convenience for opening a challenge whose
 * code the suite knows.
 *
 * Nothing here is overridden beyond what B03 already overrides — one clock and
 * one code minter. In particular the identity service, the repository, the
 * transaction manager and the audit trail are the real ones, because every
 * claim B04 makes is about what commits together.
 *
 * Test-only.
 */
import { ReadVerificationChallengeStatus } from '../../application/read-verification-challenge-status.query';
import { ResolveOrCreateVerifiedCustomer } from '../../application/resolve-or-create-verified-customer.service';
import { SubmitVerificationAttemptUseCase } from '../../application/submit-verification-attempt.use-case';
import type { ChallengeId } from '../../domain/repositories/verification-challenge.repository';
import {
  CHALLENGE_POLICY,
  createVerificationContext,
  type VerificationTestContext,
} from './verification-issue-context';

export interface OpenedChallenge {
  readonly challengeId: ChallengeId;
  /** The plaintext the scripted minter handed out for this challenge. */
  readonly code: string;
  readonly expiresAt: Date;
}

export interface AttemptTestContext extends VerificationTestContext {
  readonly attempts: SubmitVerificationAttemptUseCase;
  readonly statuses: ReadVerificationChallengeStatus;
  readonly identities: ResolveOrCreateVerifiedCustomer;
  /** Issues a live challenge through the real B03 path and reports its code. */
  open(
    contactKind: 'EMAIL' | 'PHONE',
    contact: string,
    purpose: 'SUBMISSION' | 'STEP_UP',
  ): Promise<OpenedChallenge>;
}

export async function createAttemptContext(label: string): Promise<AttemptTestContext> {
  const base = await createVerificationContext({ label, policy: CHALLENGE_POLICY });

  return {
    ...base,
    attempts: base.get<SubmitVerificationAttemptUseCase>(SubmitVerificationAttemptUseCase),
    statuses: base.get<ReadVerificationChallengeStatus>(ReadVerificationChallengeStatus),
    identities: base.get<ResolveOrCreateVerifiedCustomer>(ResolveOrCreateVerifiedCustomer),
    open: async (contactKind, contact, purpose): Promise<OpenedChallenge> => {
      const issued = await base.inRequest(() =>
        base.issuance.issue({ contactKind, contact, purpose }),
      );
      return {
        challengeId: issued.challengeId,
        code: base.minter.last,
        expiresAt: issued.expiresAt,
      };
    },
  };
}

/** A code that is well-formed and, for a scripted minter, never the real one. */
export const WRONG_CODE = '999999';
