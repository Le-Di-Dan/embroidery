/**
 * `IMP-D043` PO-07 rate limits for anonymous Session mutations (`APP3-B06A`).
 *
 * Two independent controls, because they defend against different things: the
 * mutation limit bounds what an *authorized* client may do, and the
 * authorization-failure limit bounds guessing by someone who is not authorized
 * at all. Sharing one counter would let a flood of failures exhaust a legitimate
 * session's budget.
 *
 * The algorithm is the platform's `SlidingWindowRateLimiter` — the same one
 * staff login uses. No new framework, no table, no migration.
 *
 * Keys carry **no** secret, digest or personal identity. The session id is a
 * public path value; the network key is an opaque, rotating-salt HMAC supplied
 * by the caller, never a raw IP. Both are hashed again inside the limiter.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  SlidingWindowRateLimiter,
  type RateLimitDecision,
} from '../../../../platform/rate-limit/sliding-window-rate-limiter';
import {
  DESIGN_SESSION_AUTH_CONFIG,
  type DesignSessionAuthConfig,
} from '../../config/design-session-auth.config';

const MUTATION_DIMENSION = 'design-session.mutation';
const FAILURE_DIMENSION = 'design-session.authorization-failure';

@Injectable()
export class DesignSessionRateLimiter {
  constructor(
    private readonly limiter: SlidingWindowRateLimiter,
    @Inject(DESIGN_SESSION_AUTH_CONFIG) private readonly config: DesignSessionAuthConfig,
  ) {}

  /** PO-07: 30 authorized mutations per minute, per session id. */
  checkMutation(sessionId: string): RateLimitDecision {
    return this.limiter.check(MUTATION_DIMENSION, sessionId, this.config.rateLimits.mutation);
  }

  /**
   * PO-07: 10 authorization failures per 15 minutes, per network key **and**
   * session id.
   *
   * Both dimensions are recorded. The network key alone would let one attacker
   * spread guesses across many sessions; the session id alone would let a
   * distributed attacker take a whole session's budget from its owner. A refusal
   * on either is a refusal.
   */
  checkAuthorizationFailure(networkKey: string, sessionId: string | undefined): RateLimitDecision {
    const rule = this.config.rateLimits.authorizationFailure;
    const byNetwork = this.limiter.check(`${FAILURE_DIMENSION}.network`, networkKey, rule);
    if (sessionId === undefined) {
      return byNetwork;
    }
    const bySession = this.limiter.check(`${FAILURE_DIMENSION}.session`, sessionId, rule);
    return byNetwork.allowed ? bySession : byNetwork;
  }

  /** Test seam: drops all counters. */
  reset(): void {
    this.limiter.reset();
  }
}
