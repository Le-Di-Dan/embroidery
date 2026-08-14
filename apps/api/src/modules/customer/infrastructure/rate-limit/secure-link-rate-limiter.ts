/**
 * The transport-abuse limit on the public secure-link resolver (`APP4-B06` §11,
 * IMP-D049 PO-01 `secure_link.resolve`).
 *
 * One dimension, one window, one rule: `maxRequestsPerIpPerMinute` per opaque
 * network key, read from the published policy on every call.
 *
 * ## It counts requests, never outcomes
 *
 * {@link check} takes no token, no digest, no grant and no result. It is called
 * once per request, **before** the credential is looked at, and there is no
 * second method a success or a failure could call instead. That is the
 * structural form of PO-01's rule: a limiter that charged only for failures
 * would be a validity oracle, because a caller could read a token's validity off
 * whether their budget moved. Nothing in this class's signature can express the
 * outcome, so nothing about it can vary with the credential.
 *
 * ## No new framework
 *
 * The algorithm is the platform's `SlidingWindowRateLimiter` — the same one
 * staff login and Design Sessions use, hashing identities and bounding its own
 * memory. This class supplies the dimension and turns a published number into a
 * rule. No table, no migration, no Redis.
 *
 * Counters are in-process: they reset on restart and are not shared across
 * replicas. That is the documented, accepted limitation of every limiter in this
 * repository; a distributed replacement is APP12 hardening.
 */
import { Injectable } from '@nestjs/common';

import {
  SlidingWindowRateLimiter,
  type RateLimitDecision,
} from '../../../../platform/rate-limit/sliding-window-rate-limiter';
import {
  SECURE_LINK_RESOLVE_WINDOW_MS,
  type SecureLinkResolvePolicy,
} from '../../domain/grant/secure-link-policy';

const RESOLVE_DIMENSION = 'secure-link.resolve';

@Injectable()
export class SecureLinkRateLimiter {
  constructor(private readonly limiter: SlidingWindowRateLimiter) {}

  /**
   * Records one resolve attempt for a source and reports whether it may proceed.
   *
   * The policy arrives as an argument rather than being read here, so this class
   * has no reason to know the policy store exists and the caller cannot skip the
   * fail-closed read: it has to have a policy in hand before it can ask.
   */
  check(networkKey: string, policy: SecureLinkResolvePolicy): RateLimitDecision {
    return this.limiter.check(RESOLVE_DIMENSION, networkKey, {
      max: policy.maxRequestsPerIpPerMinute,
      windowMs: SECURE_LINK_RESOLVE_WINDOW_MS,
    });
  }

  /** Test seam: drops all counters. */
  reset(): void {
    this.limiter.reset();
  }
}
