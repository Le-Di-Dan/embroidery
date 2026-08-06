/**
 * The staff login rate limiter (ADR-APP1-001 §7).
 *
 * Three independent sliding windows — normalized identifier, source IP, and a
 * global endpoint ceiling — each with its own counters. The algorithm itself is
 * the platform's `SlidingWindowRateLimiter`, which `APP3-B06A` extracted so
 * anonymous Design Session mutations share exactly this implementation rather
 * than a second copy of it. Behaviour, constructor and methods are unchanged;
 * this remains the name the identity module injects and its tests exercise.
 */
import { Injectable } from '@nestjs/common';

import { SlidingWindowRateLimiter } from '../../../../platform/rate-limit/sliding-window-rate-limiter';

export type {
  RateLimitClock,
  RateLimitDecision,
} from '../../../../platform/rate-limit/sliding-window-rate-limiter';

@Injectable()
export class LoginRateLimiter extends SlidingWindowRateLimiter {}
