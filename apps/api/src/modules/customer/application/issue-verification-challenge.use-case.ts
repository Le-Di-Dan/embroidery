/**
 * `POST /public/verification/challenges` (`APP4-B03`).
 *
 * The order of the steps is the contract, and three of them are easy to get
 * subtly wrong:
 *
 * 1. **Normalize first, through P01.** The target is the normalized value, so
 *    every later step — the lock, the arbiter, the rate count — has to agree
 *    about what "the same contact" means. `A@Example.com` and `a@example.com`
 *    are one target or the rate limit is decorative.
 * 2. **Expire stale rows before looking for a live one.** Expiry does not remove
 *    a row from CST-007's partial index; only a transition does. A challenge
 *    that timed out an hour ago still holds the slot until something moves it.
 * 3. **A live challenge is returned, not rotated.** Minting a fresh code here
 *    would make the initial-issue endpoint a cooldown-free resend, and the
 *    dedicated resend endpoint's 60-second rule would be reachable only by
 *    callers polite enough to use it.
 *
 * **No customer is looked up and none could be.** This class does not depend on
 * `CustomerRepository`, so issuance cannot branch on whether the target belongs
 * to anyone — which is `ADR-APP4-001` §1.3 rule 4 enforced structurally rather
 * than by remembering not to.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ContactKind, VerificationPurpose } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { normalizeEmail } from '../domain/contact/normalize-email';
import { normalizePhone } from '../domain/contact/normalize-phone';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type VerificationChallengeRepository,
} from '../domain/repositories/verification-challenge.repository';
import {
  rateWindowStart,
  resendAvailableAtOf,
  type VerificationChallengePolicy,
} from '../domain/verification/verification-challenge-policy';
import {
  ALREADY_OPEN,
  VerificationIssueError,
  type VerificationChallengeIssued,
} from '../domain/verification/verification-issue-outcome';
import { VerificationClock } from '../infrastructure/clock/verification-clock';
import { VerificationPolicyReader } from '../infrastructure/policy/verification-policy.reader';
import { VerificationChallengeIssuer, type IssueTarget } from './verification-challenge.issuer';

export interface IssueVerificationChallengeCommand {
  readonly contactKind: ContactKind;
  /** As entered. Normalized here, once, by the P01 authority. */
  readonly contact: string;
  readonly purpose: VerificationPurpose;
}

@Injectable()
export class IssueVerificationChallengeUseCase {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    private readonly transactions: TransactionManager,
    private readonly policies: VerificationPolicyReader,
    private readonly issuer: VerificationChallengeIssuer,
    private readonly clock: VerificationClock,
  ) {}

  async issue(command: IssueVerificationChallengeCommand): Promise<VerificationChallengeIssued> {
    const normalized = normalizeContact(command.contactKind, command.contact);
    const policy = await this.policies.require();
    const now = this.clock.now();

    return this.transactions.runInTransaction(async () => {
      // Serializes every issuance for this target and purpose. Taken first, so
      // the expire/resolve/count/insert sequence below is one decision rather
      // than four independently racy ones.
      await this.challenges.lockTarget(command.contactKind, normalized, command.purpose);
      await this.challenges.expireStale(command.contactKind, normalized, command.purpose, now);

      const live = await this.challenges.resolveOpen(
        command.contactKind,
        normalized,
        command.purpose,
        now,
      );
      if (live !== undefined) {
        // Nothing is minted, nothing is written, nothing is delivered again. The
        // client learns exactly what it would have learned from the call that
        // created this challenge, including when it may resend.
        return {
          outcome: ALREADY_OPEN,
          challengeId: live.id,
          expiresAt: live.expiresAt,
          resendAvailableAt: resendAvailableAtOf(policy, live.createdAt),
        };
      }

      await this.assertRateBudget(command.contactKind, normalized, command.purpose, policy, now);

      const target: IssueTarget = {
        contactKind: command.contactKind,
        normalizedValue: normalized,
        purpose: command.purpose,
      };
      return await this.issuer.issue(target, policy, now);
    });
  }

  /**
   * `maxIssuesPerTargetPerWindow` over durable challenge history.
   *
   * The count is the history itself rather than a counter column, so it cannot
   * drift from the rows it describes and needs no reset job. It is read under
   * the advisory lock, which is what makes read-then-insert safe: without it two
   * callers both see the budget's last slot free and both take it.
   */
  private async assertRateBudget(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    policy: VerificationChallengePolicy,
    now: Date,
  ): Promise<void> {
    const issued = await this.challenges.countIssuedSince(
      contactKind,
      normalizedValue,
      purpose,
      rateWindowStart(policy, now),
    );
    if (issued >= policy.maxIssuesPerTargetPerWindow) {
      throw new VerificationIssueError('ISSUANCE_RATE_EXCEEDED');
    }
  }
}

/**
 * The single normalization boundary.
 *
 * Both kinds go through the P01 authority and nothing here re-implements a rule
 * of it: no lowercasing, no trimming, no country-code handling. A rejection
 * becomes one bounded failure — the reason P01 gives is about the caller's own
 * input, but publishing which shape rule failed would let a caller probe the
 * normalizer, and the client already knows what it typed.
 */
function normalizeContact(kind: ContactKind, raw: string): string {
  const result = kind === 'EMAIL' ? normalizeEmail(raw) : normalizePhone(raw);
  if (!result.ok) {
    throw new VerificationIssueError('CONTACT_NOT_ACCEPTABLE');
  }
  return result.contact.normalized;
}
