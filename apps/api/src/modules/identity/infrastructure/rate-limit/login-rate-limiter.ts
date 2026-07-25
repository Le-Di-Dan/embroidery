/**
 * In-process, transient login rate limiter (ADR-APP1-001 §7).
 *
 * Three independent sliding windows — normalized identifier, source IP, and a
 * global endpoint ceiling — each with its own counters. Storage is a bounded
 * in-memory map keyed by a hash of the dimension identity, so a plaintext email
 * or IP is never retained. Counters reset on restart and are not shared across
 * replicas; a distributed/persistent replacement is APP12 hardening (documented
 * limitation, no schema).
 *
 * The clock is injected so windows are deterministic under test.
 */
import { createHash } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';

import type { RateLimitRule } from '../../config/staff-auth.config';

export type RateLimitClock = () => number;

/** Hard cap on distinct tracked keys — an abuse guard against memory growth. */
const MAX_TRACKED_KEYS = 50_000;

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Milliseconds until the next attempt is permitted (0 when allowed). */
  readonly retryAfterMs: number;
}

interface Window {
  /** Attempt timestamps still inside the window, oldest first. */
  hits: number[];
}

const ALLOWED: RateLimitDecision = { allowed: true, retryAfterMs: 0 };

@Injectable()
export class LoginRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(@Optional() private readonly clock: RateLimitClock = Date.now) {}

  /**
   * Records an attempt in one dimension and reports whether it is permitted.
   *
   * The identity is hashed into the map key, so nothing here stores a raw email
   * or IP. When the window is already full the attempt is *not* recorded (a
   * rejected attempt must not extend the penalty) and the wait time is returned.
   */
  check(dimension: string, identity: string, rule: RateLimitRule): RateLimitDecision {
    const now = this.clock();
    const key = `${dimension}:${hashIdentity(identity)}`;
    const window = this.windows.get(key) ?? { hits: [] };
    const cutoff = now - rule.windowMs;
    window.hits = window.hits.filter((at) => at > cutoff);

    if (window.hits.length >= rule.max) {
      const oldest = window.hits[0] ?? now;
      this.store(key, window);
      return { allowed: false, retryAfterMs: Math.max(0, oldest + rule.windowMs - now) };
    }

    window.hits.push(now);
    this.store(key, window);
    return ALLOWED;
  }

  /**
   * Clears the counters for one identity across a dimension — used after a
   * successful login to forgive that identifier without touching the IP/global
   * ceilings that guard against distributed abuse (ADR §12).
   */
  clear(dimension: string, identity: string): void {
    this.windows.delete(`${dimension}:${hashIdentity(identity)}`);
  }

  /** Test seam: drops all counters. */
  reset(): void {
    this.windows.clear();
  }

  private store(key: string, window: Window): void {
    if (window.hits.length === 0) {
      this.windows.delete(key);
      return;
    }
    // Opportunistic bound: when the map is at capacity, drop the least-recently
    // active key (the first in insertion order after re-insert) rather than grow
    // without limit. Delete-then-set refreshes recency for the live key.
    this.windows.delete(key);
    if (this.windows.size >= MAX_TRACKED_KEYS) {
      const oldestKey = this.windows.keys().next().value;
      if (oldestKey !== undefined) {
        this.windows.delete(oldestKey);
      }
    }
    this.windows.set(key, window);
  }
}

/** SHA-256 of the identity, so no raw email or IP is held in memory. */
function hashIdentity(identity: string): string {
  return createHash('sha256').update(identity, 'utf8').digest('base64');
}
