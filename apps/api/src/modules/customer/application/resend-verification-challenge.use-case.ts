/**
 * `POST /public/verification/challenges/{challengeId}/resend` (`APP4-B03`).
 *
 * A **business resend**, which is one of three things the vocabulary keeps
 * apart (`ADR-APP4-001` §8). It produces a new challenge, a new code, a new
 * digest, a new intent, a new outbox event and a new envelope. It never
 * re-delivers the existing envelope — that is `APP4-W01`'s automatic transport
 * retry, and it never reuses the old code, which is why the old digest is not
 * even read.
 *
 * **The target comes from the source challenge, never from the request.** The
 * body is empty by construction: accepting a contact here would turn a resend
 * into an unauthenticated redirect — anyone holding a challenge id could have
 * that challenge's code sent to an address of their choosing.
 *
 * The source is transitioned `ISSUED → CANCELLED` in the same transaction,
 * which is the transition DB3 §1 locks by name: "một open challenge per
 * (contact, purpose); challenge mới CANCELLED challenge cũ". It has to happen
 * before the insert regardless, because CST-007 will not hold two open
 * challenges for one target — but the state chosen is authority, not mechanics.
 * `EXPIRED` would claim the source reached its `expires_at` when it had not, and
 * `FAILED` would claim an attempt limit that was never reached.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallenge,
  type VerificationChallengeRepository,
} from '../domain/repositories/verification-challenge.repository';
import {
  rateWindowStart,
  resendAvailableAtOf,
  type VerificationChallengePolicy,
} from '../domain/verification/verification-challenge-policy';
import {
  VerificationIssueError,
  type VerificationChallengeIssued,
} from '../domain/verification/verification-issue-outcome';
import { VerificationClock } from '../infrastructure/clock/verification-clock';
import { VerificationPolicyReader } from '../infrastructure/policy/verification-policy.reader';
import { VerificationChallengeIssuer, type IssueTarget } from './verification-challenge.issuer';

@Injectable()
export class ResendVerificationChallengeUseCase {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    private readonly transactions: TransactionManager,
    private readonly policies: VerificationPolicyReader,
    private readonly issuer: VerificationChallengeIssuer,
    private readonly clock: VerificationClock,
  ) {}

  async resend(challengeId: ChallengeId): Promise<VerificationChallengeIssued> {
    const policy = await this.policies.require();
    const now = this.clock.now();

    // Read once outside the lock only to learn *which* target to lock. Every
    // decision below is made against the re-read inside it.
    const candidate = await this.challenges.findById(challengeId);
    if (candidate === undefined) {
      throw new VerificationIssueError('CHALLENGE_NOT_RESENDABLE');
    }

    return this.transactions.runInTransaction(async () => {
      await this.challenges.lockTarget(
        candidate.contactKind,
        candidate.normalizedValue,
        candidate.purpose,
      );
      await this.challenges.expireStale(
        candidate.contactKind,
        candidate.normalizedValue,
        candidate.purpose,
        now,
      );

      // Re-read under the lock: between the first read and here the source may
      // have been answered, expired by the sweep above, or already replaced by a
      // concurrent resend.
      const source = await this.challenges.findById(challengeId);
      if (source === undefined) {
        throw new VerificationIssueError('CHALLENGE_NOT_RESENDABLE');
      }
      assertResendable(source, now);

      if (now < resendAvailableAtOf(policy, source.createdAt)) {
        // Nothing is minted, written or delivered. The client already holds the
        // instant this becomes allowed, from the response that issued `source`.
        throw new VerificationIssueError('RESEND_TOO_SOON');
      }
      await this.assertRateBudget(source, policy, now);

      if (!(await this.challenges.cancelChallenge(source.id))) {
        // The guarded update matched nothing, so something moved the row between
        // the re-read and here. Refusing is correct: proceeding would insert a
        // second open challenge and lose to CST-007 anyway.
        throw new VerificationIssueError('CHALLENGE_NOT_RESENDABLE');
      }

      // The replacement inherits the source's lineage exactly — same target,
      // same purpose, same session and contact-point bindings. Nothing about it
      // comes from the request, which carries no body at all.
      const target: IssueTarget = {
        contactKind: source.contactKind,
        normalizedValue: source.normalizedValue,
        purpose: source.purpose,
        ...(source.sessionId === undefined ? {} : { sessionId: source.sessionId }),
        ...(source.contactPointId === undefined ? {} : { contactPointId: source.contactPointId }),
      };
      return await this.issuer.issue(target, policy, now);
    });
  }

  private async assertRateBudget(
    source: VerificationChallenge,
    policy: VerificationChallengePolicy,
    now: Date,
  ): Promise<void> {
    const issued = await this.challenges.countIssuedSince(
      source.contactKind,
      source.normalizedValue,
      source.purpose,
      rateWindowStart(policy, now),
    );
    if (issued >= policy.maxIssuesPerTargetPerWindow) {
      throw new VerificationIssueError('ISSUANCE_RATE_EXCEEDED');
    }
  }
}

/**
 * A resend replaces a **live** challenge, and only that.
 *
 * One refusal for every reason — answered, failed, expired, already replaced,
 * or timed out but not yet swept. Distinguishing them would make the route an
 * oracle over challenge ids: a caller could confirm that an id it guessed is
 * real and then watch its state change. A caller whose challenge has expired is
 * not stuck; the issue endpoint is the path, and it still holds the contact it
 * typed.
 */
function assertResendable(source: VerificationChallenge, now: Date): void {
  if (source.status !== 'ISSUED' || source.expiresAt <= now) {
    throw new VerificationIssueError('CHALLENGE_NOT_RESENDABLE');
  }
}
