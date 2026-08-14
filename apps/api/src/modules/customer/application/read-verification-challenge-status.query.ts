/**
 * `GET /public/verification/challenges/{challengeId}` (`APP4-B04` §17).
 *
 * A read, and structurally nothing else: no `TransactionManager`, no writing
 * repository method reachable from here, and one query. That matters because
 * the obvious "helpful" version of this endpoint sweeps the row it just found
 * to be past its expiry — which would make a GET a mutation, let an unknown
 * caller drive lifecycle transitions by polling, and take the physical expiry
 * transition away from the two paths that own it (`APP4-B03` issue,
 * `APP4-B04` attempt).
 *
 * **Effective expiry is computed, never written.** An `ISSUED` row past its
 * `expires_at` is already unanswerable — `resolveOpen` will not return it and
 * the attempt path refuses it — so reporting `ISSUED` because no sweeper has
 * run yet would be the one thing this endpoint exists to prevent: a client
 * waiting on a code that can no longer be used.
 *
 * **Two facts, and they are the two the client needs.** The state, so the UI
 * knows whether to show a code field, a success or a "request a new code"; and
 * the expiry, so it can count down without hard-coding a TTL. Everything else
 * about a challenge is withheld — the purpose, the contact, the mask, the
 * customer, the contact point, the session, the attempt history, the code and
 * its digest, and any notification state. A status endpoint that disclosed the
 * purpose would let anyone holding an id learn that a step-up was requested;
 * one that disclosed the attempt count would meter an attacker's own budget for
 * them.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { VerificationChallengeState } from '@embroidery/database';

import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallenge,
  type VerificationChallengeRepository,
} from '../domain/repositories/verification-challenge.repository';
import { VerificationClock } from '../infrastructure/clock/verification-clock';

export interface VerificationChallengeStatus {
  readonly challengeId: ChallengeId;
  readonly state: VerificationChallengeState;
  readonly expiresAt: Date;
}

/**
 * The public state of a challenge at an instant.
 *
 * `>=` matches `expireStale`'s `expires_at <= now` and the inverse of
 * `resolveOpen`'s `expires_at > now`, so this projection and the physical sweep
 * agree about the instant of expiry. Disagreeing by one boundary is how a row
 * reads live here and refuses an answer a millisecond later.
 */
export function effectiveState(
  challenge: VerificationChallenge,
  now: Date,
): VerificationChallengeState {
  return challenge.status === 'ISSUED' && now >= challenge.expiresAt ? 'EXPIRED' : challenge.status;
}

@Injectable()
export class ReadVerificationChallengeStatus {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    private readonly clock: VerificationClock,
  ) {}

  /** `undefined` for an unknown id — the caller renders the public 404. */
  async read(challengeId: ChallengeId): Promise<VerificationChallengeStatus | undefined> {
    const challenge = await this.challenges.findById(challengeId);
    if (challenge === undefined) {
      return undefined;
    }
    return {
      challengeId: challenge.id,
      state: effectiveState(challenge, this.clock.now()),
      expiresAt: challenge.expiresAt,
    };
  }
}
