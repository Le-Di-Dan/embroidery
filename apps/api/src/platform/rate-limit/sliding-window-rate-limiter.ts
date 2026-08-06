/**
 * The in-process sliding-window rate limiter (`ADR-APP1-001` §7, `APP3-B06A`).
 *
 * Extracted verbatim from `LoginRateLimiter`, which now subclasses it: staff
 * login and anonymous Design Session mutations need the same algorithm, and a
 * second copy is how one of them silently stops matching the other. Nothing
 * about the behaviour changed in the move.
 *
 * Storage is a bounded in-memory map keyed by a hash of the dimension identity,
 * so no plaintext email, IP or session identifier is retained. Counters reset on
 * restart and are not shared across replicas; a distributed replacement is APP12
 * hardening (documented limitation, no schema).
 *
 * The clock is injected so windows are deterministic under test.
 */
import { createHash } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';

export type RateLimitClock = () => number;

/** A bounded window. Structural, so a module's own config type satisfies it. */
export interface RateLimitRule {
  readonly max: number;
  readonly windowMs: number;
}

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
export class SlidingWindowRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(@Optional() private readonly clock: RateLimitClock = Date.now) {}

  /**
   * Records an attempt in one dimension and reports whether it is permitted.
   *
   * The identity is hashed into the map key, so nothing here stores a raw
   * identifier. When the window is already full the attempt is *not* recorded (a
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
   * successful attempt to forgive that identifier without touching the broader
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

/** SHA-256 of the identity, so no raw identifier is held in memory. */
function hashIdentity(identity: string): string {
  return createHash('sha256').update(identity, 'utf8').digest('base64');
}
