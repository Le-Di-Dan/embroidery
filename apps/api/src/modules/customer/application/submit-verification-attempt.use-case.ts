/**
 * `POST /public/verification/challenges/{challengeId}/attempts` (`APP4-B04`).
 *
 * One transaction per pass, and the order of the steps inside it *is* the
 * contract (`APP4-B04` §8). Four of them are easy to get subtly wrong:
 *
 * 1. **Take the target lock first.** Every decision below — how many attempts
 *    exist, whether the challenge is still open, whether it has expired — is
 *    read-then-write, and two concurrent submissions both reading "four
 *    attempts" both write a fifth. `lockTarget` is the delivered `APP4-B03`
 *    serialization for exactly this shape of race; the challenge's target is
 *    fixed, so every attempt against one challenge queues behind the same key.
 * 2. **Check expiry before comparing.** A correct code submitted at or after
 *    `expires_at` must fail. Comparing first and then noticing the expiry would
 *    make the digest comparison observable to a caller whose challenge is dead,
 *    and — worse — invites a later edit that "helpfully" completes it.
 * 3. **Derive the budget from the ledger.** `countAttempts` over the append-only
 *    `contact_verification_attempts` is the only counter there is (TBL-007 —
 *    "DB4 stores no counter, no lockout state and none is invented"), so the
 *    limit cannot drift from the rows that justify it and needs no reset job.
 * 4. **Complete through the guarded transition.** `completeChallenge` updates
 *    `WHERE status = 'ISSUED' AND expires_at > now`, so single use is the
 *    database's arbiter rather than this file's belief about who else is
 *    running. There is no process-local mutex here and there must not be: one
 *    would be silent about the second API replica.
 *
 * **A refusal returns; it does not throw.** A `MISMATCH` row, an
 * `EXPIRED_AT_ENTRY` row and an `ISSUED → FAILED` transition are all durable
 * evidence written on paths the caller experiences as failure, and throwing
 * would roll back exactly the record that makes the attempt budget real. Only
 * a failure whose transaction *must* be undone travels as an error.
 *
 * **The submitted code lives in one local scope.** It arrives as an argument,
 * reaches `verifySecretDigest` once, and is never logged, persisted, returned,
 * put in an error, or passed to `APP4-B02` — which takes proof that
 * verification happened, never the secret that proved it.
 */
import { Inject, Injectable } from '@nestjs/common';

import { App4SecretPepperProvider } from '../config/app4-secret-pepper.provider';
import { TransactionManager } from '@embroidery/persistence';

import { verifiedContactEvidenceOf } from '../domain/verification/challenge-verified-evidence';
import { verifySecretDigest } from '../domain/secret/app4-secret-digest';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallenge,
  type VerificationChallengeRepository,
} from '../domain/repositories/verification-challenge.repository';
import type { CustomerId } from '../domain/repositories/customer.repository';
import { isVerifiedIdentityConflict } from '../domain/identity/verified-identity-outcome';
import type { VerificationChallengePolicy } from '../domain/verification/verification-challenge-policy';
import {
  LOCKED,
  MISMATCH,
  NOT_ANSWERABLE,
  VERIFIED,
  VerificationAttemptError,
  type VerificationAttemptResult,
} from '../domain/verification/verification-attempt-outcome';
import { VerificationClock } from '../infrastructure/clock/verification-clock';
import { VerificationPolicyReader } from '../infrastructure/policy/verification-policy.reader';
import { ResolveOrCreateVerifiedCustomer } from './resolve-or-create-verified-customer.service';
import { VerificationOutcomeAuditRecorder } from './verification-outcome-audit.recorder';

/** The one `APP4-B02` failure a second pass can genuinely resolve. */
const CONCURRENT_VERIFICATION_LOSS = 'CONCURRENT_VERIFICATION_LOSS';

/** Two passes: the original, and the one that resolves a lost CST-005 race. */
const MAX_PASSES = 2;

@Injectable()
export class SubmitVerificationAttemptUseCase {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    private readonly transactions: TransactionManager,
    private readonly policies: VerificationPolicyReader,
    private readonly identities: ResolveOrCreateVerifiedCustomer,
    private readonly audit: VerificationOutcomeAuditRecorder,
    private readonly peppers: App4SecretPepperProvider,
    private readonly clock: VerificationClock,
  ) {}

  /**
   * Answers one challenge.
   *
   * The policy is read before the transaction opens: a process that cannot read
   * `verification.challenge` has no attempt budget to enforce, and enforcing a
   * guessed one would be a lockout rule nobody published. It fails closed
   * through the delivered `VerificationIssueError`, which the controller already
   * maps to a 503.
   */
  async submit(challengeId: ChallengeId, code: string): Promise<VerificationAttemptResult> {
    const policy = await this.policies.require();

    // Bounded at two, and the bound is the point. A lost CST-005 race means
    // another transaction verified this same contact, so a second pass finds the
    // winner and resolves onto it. A third would be an open loop against live
    // contention (`APP4-B04` §13).
    for (let pass = 1; ; pass += 1) {
      try {
        return await this.runPass(challengeId, code, policy);
      } catch (error: unknown) {
        if (!isConcurrentVerificationLoss(error) || pass >= MAX_PASSES) {
          throw this.classify(error);
        }
      }
    }
  }

  /**
   * One whole attempt transaction.
   *
   * Nothing here catches: an identity conflict has already aborted the
   * transaction PostgreSQL-side, so the only correct thing left to do is let it
   * roll back — which is also what guarantees a lost pass leaves no attempt row,
   * no completion and no half-made customer.
   */
  private async runPass(
    challengeId: ChallengeId,
    code: string,
    policy: VerificationChallengePolicy,
  ): Promise<VerificationAttemptResult> {
    return this.transactions.runInTransaction(async () => {
      // Read once, unlocked, only to learn *which* target to lock. Every
      // decision below is made against the re-read inside it.
      const candidate = await this.challenges.findById(challengeId);
      if (candidate === undefined) {
        return { outcome: NOT_ANSWERABLE };
      }
      await this.challenges.lockTarget(
        candidate.contactKind,
        candidate.normalizedValue,
        candidate.purpose,
      );

      const challenge = await this.challenges.findById(challengeId);
      if (challenge === undefined || challenge.status !== 'ISSUED') {
        // Terminal — verified, failed, expired or cancelled. No attempt row is
        // appended: TBL-007 records answers to a live challenge, and a replay
        // against a closed one is not another answer.
        return { outcome: NOT_ANSWERABLE };
      }

      const now = this.clock.now();
      if (now >= challenge.expiresAt) {
        return await this.expireAtEntry(challenge, now);
      }

      const spent = await this.challenges.countAttempts(challenge.id);
      if (spent >= policy.maxAttempts) {
        // Reachable only if a prior pass appended the last attempt and then
        // failed to transition — the comparison is skipped either way, and the
        // terminal state is made true rather than assumed.
        return await this.lockOut(challenge);
      }

      return await this.compare(challenge, code, policy, spent, now);
    });
  }

  /**
   * §9 — expiry wins over a correct code, and wins before it is read.
   *
   * `expireStale` performs the `ISSUED → EXPIRED` transition for this target;
   * CST-007 guarantees at most one `ISSUED` row per (kind, value, purpose), so
   * the row it moves is this one. A later call finds a terminal challenge and
   * appends nothing.
   */
  private async expireAtEntry(
    challenge: VerificationChallenge,
    now: Date,
  ): Promise<VerificationAttemptResult> {
    await this.challenges.recordAttempt(challenge.id, 'EXPIRED_AT_ENTRY', now);
    await this.challenges.expireStale(
      challenge.contactKind,
      challenge.normalizedValue,
      challenge.purpose,
      now,
    );
    await this.audit.recordExpiredAtEntry(challenge);
    return { outcome: NOT_ANSWERABLE };
  }

  /** The constant-time comparison, and the two things it can lead to. */
  private async compare(
    challenge: VerificationChallenge,
    code: string,
    policy: VerificationChallengePolicy,
    spent: number,
    now: Date,
  ): Promise<VerificationAttemptResult> {
    const digest = await this.challenges.findCodeDigest(challenge.id);
    // `verifySecretDigest` returns `false` for an empty or malformed stored
    // digest rather than throwing, so a broken row fails as a mismatch and
    // spends an attempt — never as an exception whose message or timing says
    // which row is broken.
    const matched = verifySecretDigest(
      this.peppers.require().verificationCodePepper,
      code,
      digest ?? '',
    );

    if (!matched) {
      await this.challenges.recordAttempt(challenge.id, 'MISMATCH', now);
      if (spent + 1 >= policy.maxAttempts) {
        return await this.lockOut(challenge);
      }
      return { outcome: MISMATCH };
    }

    await this.challenges.recordAttempt(challenge.id, 'MATCH', now);
    return await this.consume(challenge, now);
  }

  /**
   * §11/§12 — consumption and, for a `SUBMISSION`, the identity it establishes.
   *
   * `completeChallenge` is the guarded `ISSUED → VERIFIED` transition and it
   * throws when it matches nothing, so two concurrent correct submissions cannot
   * both succeed even if the advisory lock were ever dropped. B02 then runs
   * **inside this same transaction** — it joins rather than opening its own — so
   * a committed `VERIFIED` without its customer is not a state that can exist.
   */
  private async consume(
    challenge: VerificationChallenge,
    now: Date,
  ): Promise<VerificationAttemptResult> {
    const completed = await this.challenges.completeChallenge(challenge.id, now);

    // `STEP_UP` completes and stops. It creates no customer, no grant and no
    // business action; its only product is a `VERIFIED` challenge that
    // `hasRecentCompleted` can read, which is what `APP4-B05` consumes.
    const customerId =
      challenge.purpose === 'SUBMISSION' ? await this.establishIdentity(challenge, now) : undefined;

    await this.audit.recordVerified({
      challenge,
      ...(customerId === undefined ? {} : { customerId }),
    });

    return { outcome: VERIFIED, challengeId: completed.id, expiresAt: completed.expiresAt };
  }

  /** `SUBMISSION` → the accepted `APP4-B02` service, in this transaction. */
  private async establishIdentity(
    challenge: VerificationChallenge,
    verifiedAt: Date,
  ): Promise<CustomerId> {
    const evidence = verifiedContactEvidenceOf(challenge, verifiedAt);
    if (evidence === undefined) {
      // The stored target is not its own canonical form, so no honest evidence
      // can be built from it. Refusing rolls the whole transaction back rather
      // than registering an identity under a value CST-005 reads differently.
      throw new VerificationAttemptError('IDENTITY_NOT_RESOLVABLE');
    }
    const resolution = await this.identities.resolve(evidence);
    return resolution.customerId;
  }

  /** `ISSUED → FAILED`, made true rather than assumed. No comparison. */
  private async lockOut(challenge: VerificationChallenge): Promise<VerificationAttemptResult> {
    await this.challenges.failChallenge(challenge.id);
    await this.audit.recordLockedOut(challenge);
    return { outcome: LOCKED };
  }

  /**
   * Translates the identity conflicts that survive the retry, and only those.
   *
   * Everything else — a persistence fault, a programming error — travels as
   * itself to the platform filter, which sanitises it. Shaping unknown errors
   * into a bounded verification failure here is how a defect would be reported
   * to a client as an ordinary refusal.
   */
  private classify(error: unknown): unknown {
    if (isConcurrentVerificationLoss(error)) {
      return new VerificationAttemptError('VERIFICATION_CONFLICT_UNRESOLVED');
    }
    if (isVerifiedIdentityConflict(error)) {
      return new VerificationAttemptError('IDENTITY_NOT_RESOLVABLE');
    }
    return error;
  }
}

function isConcurrentVerificationLoss(error: unknown): boolean {
  return isVerifiedIdentityConflict(error) && error.failure === CONCURRENT_VERIFICATION_LOSS;
}
