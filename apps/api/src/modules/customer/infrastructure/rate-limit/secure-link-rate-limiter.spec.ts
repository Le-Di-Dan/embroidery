/**
 * The secure-link resolve budget, proved at its threshold (`APP12-H01` §13).
 *
 * `APP12-H01`'s first tier argued this from the source: the limiter is charged
 * before any HMAC work, both public token surfaces share one dimension, and the
 * class cannot express an outcome. Those are the right observations, and none of
 * them is a measurement. This file measures.
 *
 * ## Deterministic, not timed
 *
 * `SlidingWindowRateLimiter` takes its clock as a constructor argument for
 * exactly this reason, so the window is advanced by assignment rather than by
 * sleeping. Nothing here waits, nothing races, and the same run on a loaded CI
 * box produces the same answer — which is what makes a threshold test worth
 * having. A limiter proved by `setTimeout` is a limiter nobody trusts enough to
 * keep.
 *
 * ## What is actually at stake
 *
 * The budget is an abuse control on the one anonymous surface that takes a
 * credential. Two properties make it a security control rather than a
 * convenience:
 *
 * 1. **It refuses in bounded fashion.** Over budget must be a refusal with a
 *    finite, honest `Retry-After`, not a lockout and not an unbounded one.
 * 2. **It is charged identically whatever the token turns out to be.** A
 *    limiter that charged only for failures would let a caller read a token's
 *    validity off whether their budget moved — the oracle the indistinguishable
 *    `SECURE_LINK_UNAVAILABLE` exists to deny. `check()` takes no token, no
 *    digest and no result, so this is structural; the test below pins it as
 *    behaviour too.
 */
import { SlidingWindowRateLimiter } from '../../../../platform/rate-limit/sliding-window-rate-limiter';
import { SECURE_LINK_RESOLVE_WINDOW_MS } from '../../domain/grant/secure-link-policy';
import { SecureLinkRateLimiter } from './secure-link-rate-limiter';

/** A published policy value, not a business constant. */
const POLICY = { maxRequestsPerIpPerMinute: 5 } as const;

/** Two different callers, so the budget can be shown to be per-source. */
const SOURCE = 'network-key-a';
const OTHER_SOURCE = 'network-key-b';

function makeLimiter(): { limiter: SecureLinkRateLimiter; advance: (ms: number) => void } {
  let now = 1_000_000;
  const limiter = new SecureLinkRateLimiter(new SlidingWindowRateLimiter(() => now));
  return {
    limiter,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('the secure-link resolve budget', () => {
  it('admits exactly the budget and refuses the next request', () => {
    const { limiter } = makeLimiter();

    for (let attempt = 1; attempt <= POLICY.maxRequestsPerIpPerMinute; attempt += 1) {
      expect(limiter.check(SOURCE, POLICY).allowed).toBe(true);
    }

    // The (max + 1)th. This is the threshold, asserted as the boundary rather
    // than as "eventually refuses" — an off-by-one in either direction is a
    // budget nobody configured.
    expect(limiter.check(SOURCE, POLICY).allowed).toBe(false);
  });

  it('refuses in a bounded way, with an honest wait', () => {
    const { limiter } = makeLimiter();
    for (let attempt = 0; attempt < POLICY.maxRequestsPerIpPerMinute; attempt += 1) {
      limiter.check(SOURCE, POLICY);
    }

    const refused = limiter.check(SOURCE, POLICY);
    expect(refused.allowed).toBe(false);
    // Bounded: a real wait the caller can act on, never a lockout and never
    // longer than the window it is measured against.
    expect(refused.retryAfterMs).toBeGreaterThan(0);
    expect(refused.retryAfterMs).toBeLessThanOrEqual(SECURE_LINK_RESOLVE_WINDOW_MS);
  });

  it('lets the source back in once its window has moved', () => {
    const { limiter, advance } = makeLimiter();
    for (let attempt = 0; attempt < POLICY.maxRequestsPerIpPerMinute; attempt += 1) {
      limiter.check(SOURCE, POLICY);
    }
    expect(limiter.check(SOURCE, POLICY).allowed).toBe(false);

    // The window is a sliding one, so the budget returns rather than resetting
    // on a fixed boundary a caller could synchronise to.
    advance(SECURE_LINK_RESOLVE_WINDOW_MS + 1);
    expect(limiter.check(SOURCE, POLICY).allowed).toBe(true);
  });

  it('charges the source that spent it, and no other', () => {
    const { limiter } = makeLimiter();
    for (let attempt = 0; attempt < POLICY.maxRequestsPerIpPerMinute; attempt += 1) {
      limiter.check(SOURCE, POLICY);
    }
    expect(limiter.check(SOURCE, POLICY).allowed).toBe(false);

    // One exhausted caller must not deny the service to everyone else, which is
    // the failure mode a global-only limiter has.
    expect(limiter.check(OTHER_SOURCE, POLICY).allowed).toBe(true);
  });

  it('cannot be told what the token was, so it cannot charge by outcome', () => {
    const { limiter } = makeLimiter();

    // The structural half of this claim is the signature: `check(networkKey,
    // policy)` has no third parameter a caller could pass a token, a digest or a
    // result in, and the class publishes no second method a success could call
    // instead. That is visible in the type and is what makes the property hold
    // by construction rather than by discipline.
    //
    // What is asserted here is the behavioural half, which is the same claim
    // seen from outside: the count moves for every call, so five identical calls
    // exhaust the budget whatever they carried — and a caller therefore cannot
    // read a token's validity off whether their budget moved.
    for (let attempt = 0; attempt < POLICY.maxRequestsPerIpPerMinute; attempt += 1) {
      expect(limiter.check(SOURCE, POLICY).allowed).toBe(true);
    }
    expect(limiter.check(SOURCE, POLICY).allowed).toBe(false);
  });

  it('reads its budget from the policy it is handed, never from a constant', () => {
    const { limiter } = makeLimiter();

    // A deployment that publishes a different number gets that number. The
    // limiter holds no default of its own to fall back to — which is what makes
    // the fail-closed policy read upstream meaningful.
    const tighter = { maxRequestsPerIpPerMinute: 1 } as const;
    expect(limiter.check(SOURCE, tighter).allowed).toBe(true);
    expect(limiter.check(SOURCE, tighter).allowed).toBe(false);
  });
});
