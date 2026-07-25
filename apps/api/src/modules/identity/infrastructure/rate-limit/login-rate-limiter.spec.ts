import { LoginRateLimiter } from './login-rate-limiter';
import type { RateLimitRule } from '../../config/staff-auth.config';

const RULE: RateLimitRule = { max: 3, windowMs: 1000 };

describe('LoginRateLimiter', () => {
  it('permits up to the limit, then rejects with a wait time', () => {
    const now = 0;
    const limiter = new LoginRateLimiter(() => now);
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check('identifier', 'a@x.test', RULE).allowed).toBe(true);
    }
    const blocked = limiter.check('identifier', 'a@x.test', RULE);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('keeps dimensions and identities independent', () => {
    const limiter = new LoginRateLimiter(() => 0);
    for (let i = 0; i < 3; i += 1) {
      limiter.check('identifier', 'a@x.test', RULE);
    }
    // A different identity and a different dimension are unaffected.
    expect(limiter.check('identifier', 'b@x.test', RULE).allowed).toBe(true);
    expect(limiter.check('ip', 'a@x.test', RULE).allowed).toBe(true);
  });

  it('forgets attempts once the window has elapsed', () => {
    let now = 0;
    const limiter = new LoginRateLimiter(() => now);
    for (let i = 0; i < 3; i += 1) {
      limiter.check('identifier', 'a@x.test', RULE);
    }
    expect(limiter.check('identifier', 'a@x.test', RULE).allowed).toBe(false);
    now = 1001;
    expect(limiter.check('identifier', 'a@x.test', RULE).allowed).toBe(true);
  });

  it('clears one identity without touching others', () => {
    const limiter = new LoginRateLimiter(() => 0);
    for (let i = 0; i < 3; i += 1) {
      limiter.check('identifier', 'a@x.test', RULE);
    }
    limiter.clear('identifier', 'a@x.test');
    expect(limiter.check('identifier', 'a@x.test', RULE).allowed).toBe(true);
  });

  it('does not extend the penalty when a rejected attempt arrives', () => {
    let now = 0;
    const limiter = new LoginRateLimiter(() => now);
    for (let i = 0; i < 3; i += 1) {
      limiter.check('identifier', 'a@x.test', RULE);
    }
    now = 500;
    limiter.check('identifier', 'a@x.test', RULE); // rejected, not recorded
    now = 1001; // original window elapsed
    expect(limiter.check('identifier', 'a@x.test', RULE).allowed).toBe(true);
  });
});
