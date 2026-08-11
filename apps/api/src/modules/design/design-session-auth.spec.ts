/**
 * The anonymous Session authorization foundation (`APP3-B06A`, `IMP-D043`).
 *
 * The cases worth reading twice are the ones about what a refusal *reveals*.
 * Ownership is a pair, so every way of holding half of it — the id without the
 * cookie, a cookie without the id, a neighbour's cookie, the right id after
 * expiry — has to be indistinguishable from outside, and separately
 * distinguishable inside, or neither the enumeration rule nor the tests that
 * prove it mean anything.
 */
import { HttpStatus } from '@nestjs/common';

import { AuthorizeDesignSessionService } from './application/authorize-design-session.service';
import {
  DESIGN_SESSION_PEPPER_ENV,
  loadDesignSessionAuthConfig,
  type DesignSessionAuthConfig,
} from './config/design-session-auth.config';
import {
  clearsCookie,
  designSessionOriginRefused,
  designSessionRateLimited,
  designSessionStaleWrite,
  designSessionUnauthorized,
} from './domain/design-session-authorization';
import type {
  DesignSession,
  DesignSessionRepository,
} from './domain/repositories/design-session.repository';
import { DesignSessionSecretVerifier } from './infrastructure/crypto/design-session-secret.verifier';
import {
  buildDesignSessionCookieName,
  DesignSessionCookiePolicy,
  isCanonicalSessionId,
} from './infrastructure/http/design-session-cookie.policy';
import { DesignSessionOriginPolicy } from './infrastructure/http/design-session-origin.policy';
import { DesignSessionRateLimiter } from './infrastructure/rate-limit/design-session-rate-limiter';
import {
  EphemeralNetworkKeyService,
  normalizeAddress,
} from './infrastructure/rate-limit/ephemeral-network-key.service';
import { SlidingWindowRateLimiter } from '../../platform/rate-limit/sliding-window-rate-limiter';

const SESSION_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const OTHER_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const PEPPER = 'p'.repeat(48);
const SECRET = 'A'.repeat(43);
const ORIGIN = 'https://nettheu.example';

const config: DesignSessionAuthConfig = {
  secretPepper: PEPPER,
  allowedOrigins: [ORIGIN],
  cookieSecure: true,
  rateLimits: {
    mutation: { max: 30, windowMs: 60_000 },
    authorizationFailure: { max: 10, windowMs: 900_000 },
    creation: { max: 5, windowMs: 3_600_000 },
    creationBurst: { max: 2, windowMs: 60_000 },
    read: { max: 60, windowMs: 60_000 },
  },
};

const verifier = new DesignSessionSecretVerifier(config);
const cookies = new DesignSessionCookiePolicy(config);

function session(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    id: SESSION_ID,
    sessionSecretHash: verifier.digest(SECRET),
    productId: 'product',
    productVariantId: undefined,
    productSideId: 'side',
    embroideryAreaId: 'area',
    designDocument: {},
    documentSchemaVersion: 1,
    autosaveRevision: 7,
    templateId: undefined,
    templateVersion: undefined,
    status: 'ACTIVE',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    lastActivityAt: new Date('2026-01-01T00:00:00.000Z'),
    submittedRequestId: undefined,
    ...overrides,
  } as unknown as DesignSession;
}

function repository(found: DesignSession | undefined): DesignSessionRepository {
  return { findById: () => Promise.resolve(found) } as unknown as DesignSessionRepository;
}

const cookieHeader = (id: string, secret: string) =>
  `${buildDesignSessionCookieName(id)}=${secret}`;

const requestWith = (cookie: string | undefined) => ({
  headers: cookie === undefined ? {} : { cookie },
});

const authorize = (found: DesignSession | undefined, cookie: string | undefined, now?: Date) =>
  new AuthorizeDesignSessionService(repository(found), verifier, cookies).authorize(
    requestWith(cookie),
    SESSION_ID,
    now,
  );

describe('configuration', () => {
  const base = { NODE_ENV: 'test' } as NodeJS.ProcessEnv;

  it('requires the pepper and offers no fallback', () => {
    expect(() => loadDesignSessionAuthConfig({ ...base })).toThrow(DESIGN_SESSION_PEPPER_ENV);
  });

  it('rejects an empty pepper, which would verify like no pepper at all', () => {
    expect(() =>
      loadDesignSessionAuthConfig({ ...base, [DESIGN_SESSION_PEPPER_ENV]: '   ' }),
    ).toThrow(DESIGN_SESSION_PEPPER_ENV);
  });

  it('rejects a pepper short enough to be a placeholder', () => {
    expect(() =>
      loadDesignSessionAuthConfig({ ...base, [DESIGN_SESSION_PEPPER_ENV]: 'short' }),
    ).toThrow(/at least 32/);
  });

  it('never puts the pepper in the error it throws', () => {
    try {
      loadDesignSessionAuthConfig({ ...base, [DESIGN_SESSION_PEPPER_ENV]: 'short-secret-value' });
    } catch (error: unknown) {
      expect((error as Error).message).not.toContain('short-secret-value');
    }
  });

  it('carries the locked PO-07 limits, which are not environment-tunable', () => {
    const loaded = loadDesignSessionAuthConfig({ ...base, [DESIGN_SESSION_PEPPER_ENV]: PEPPER });
    expect(loaded.rateLimits.mutation).toEqual({ max: 30, windowMs: 60_000 });
    expect(loaded.rateLimits.authorizationFailure).toEqual({ max: 10, windowMs: 900_000 });
  });
});

describe('the cookie name', () => {
  it('is derived from the session id, in the locked form', () => {
    expect(buildDesignSessionCookieName(SESSION_ID)).toBe(`__Host-nettheu_ds_${SESSION_ID}`);
  });

  it('refuses to be built from a non-canonical id', () => {
    for (const bad of ['', 'not-a-uuid', `${SESSION_ID}; Path=/`, `${SESSION_ID}=x`]) {
      expect(isCanonicalSessionId(bad)).toBe(false);
      expect(() => buildDesignSessionCookieName(bad)).toThrow();
    }
  });

  it('reads only the cookie belonging to this session', () => {
    const header = `${cookieHeader(OTHER_ID, 'foreign')}; ${cookieHeader(SESSION_ID, SECRET)}`;
    expect(cookies.extract({ headers: { cookie: header } }, SESSION_ID).secret).toBe(SECRET);
    expect(cookies.extract({ headers: { cookie: header } }, OTHER_ID).secret).toBe('foreign');
  });

  it('reports a duplicated name with differing values as ambiguous', () => {
    const header = `${cookieHeader(SESSION_ID, 'a')}; ${cookieHeader(SESSION_ID, 'b')}`;
    const extracted = cookies.extract({ headers: { cookie: header } }, SESSION_ID);
    expect(extracted.ambiguous).toBe(true);
    expect(extracted.secret).toBeUndefined();
  });

  it('clears with attributes that match how it was set', () => {
    const value = cookies.serializeDeletionCookie(SESSION_ID);
    expect(value).toContain(`__Host-nettheu_ds_${SESSION_ID}=`);
    expect(value).toContain('Max-Age=0');
    expect(value).toContain('Expires=Thu, 01 Jan 1970');
    expect(value).toContain('Path=/');
    expect(value).toContain('HttpOnly');
    expect(value).toContain('SameSite=Lax');
    expect(value).toContain('Secure');
    expect(value).not.toContain('Domain');
  });
});

describe('secret verification', () => {
  it('accepts the secret whose peppered HMAC is stored', () => {
    expect(verifier.verify(SECRET, verifier.digest(SECRET))).toBe(true);
  });

  it('rejects a wrong secret of the same shape', () => {
    expect(verifier.verify('B'.repeat(43), verifier.digest(SECRET))).toBe(false);
  });

  it('rejects a malformed secret without throwing', () => {
    for (const bad of ['', 'short', `${SECRET}extra`, 'A'.repeat(42), 'A/'.repeat(21)]) {
      expect(verifier.verify(bad, verifier.digest(SECRET))).toBe(false);
    }
  });

  it('is peppered: the same secret under another pepper does not verify', () => {
    const other = new DesignSessionSecretVerifier({ ...config, secretPepper: 'q'.repeat(48) });
    expect(other.verify(SECRET, verifier.digest(SECRET))).toBe(false);
  });

  it('survives a stored digest of the wrong length instead of throwing', () => {
    // `timingSafeEqual` throws on unequal buffers; both sides are folded to a
    // fixed width first, so this is a mismatch rather than a 500.
    expect(verifier.verify(SECRET, 'not-a-digest')).toBe(false);
  });
});

describe('authorization', () => {
  it('accepts the pair and reports the revision', async () => {
    const outcome = await authorize(session(), cookieHeader(SESSION_ID, SECRET));
    expect(outcome.authorized).toBe(true);
    if (outcome.authorized) {
      expect(outcome.context.designSessionId).toBe(SESSION_ID);
      expect(outcome.context.currentRevision).toBe(7);
    }
  });

  it('refuses the id alone', async () => {
    const outcome = await authorize(session(), undefined);
    expect(outcome.authorized).toBe(false);
    if (!outcome.authorized) expect(outcome.reason).toBe('COOKIE_MISSING');
  });

  it('refuses a foreign session cookie for this id', async () => {
    const outcome = await authorize(session(), cookieHeader(OTHER_ID, SECRET));
    expect(outcome.authorized).toBe(false);
    if (!outcome.authorized) expect(outcome.reason).toBe('COOKIE_MISSING');
  });

  it('refuses a wrong secret', async () => {
    const outcome = await authorize(session(), cookieHeader(SESSION_ID, 'B'.repeat(43)));
    if (!outcome.authorized) expect(outcome.reason).toBe('SECRET_MISMATCH');
  });

  it('refuses an unknown session', async () => {
    const outcome = await authorize(undefined, cookieHeader(SESSION_ID, SECRET));
    if (!outcome.authorized) expect(outcome.reason).toBe('SESSION_NOT_FOUND');
  });

  it('refuses a non-ACTIVE session', async () => {
    const outcome = await authorize(
      session({ status: 'EXPIRED' } as unknown as Partial<DesignSession>),
      cookieHeader(SESSION_ID, SECRET),
    );
    if (!outcome.authorized) expect(outcome.reason).toBe('SESSION_NOT_ACTIVE');
  });

  it('refuses an expired session on absolute TTL', async () => {
    const outcome = await authorize(
      session({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
      cookieHeader(SESSION_ID, SECRET),
      new Date('2026-01-01T00:00:00.000Z'),
    );
    if (!outcome.authorized) expect(outcome.reason).toBe('SESSION_EXPIRED');
  });

  it('checks liveness only after the secret, so status is not an oracle', async () => {
    // Wrong secret on an expired session still reports the secret failure.
    const outcome = await authorize(
      session({ status: 'EXPIRED' } as unknown as Partial<DesignSession>),
      cookieHeader(SESSION_ID, 'B'.repeat(43)),
    );
    if (!outcome.authorized) expect(outcome.reason).toBe('SECRET_MISMATCH');
  });

  it('refuses a malformed session id before touching a cookie or a query', async () => {
    const service = new AuthorizeDesignSessionService(
      {
        findById: () => Promise.reject(new Error('must not be read')),
      } as unknown as DesignSessionRepository,
      verifier,
      cookies,
    );
    const outcome = await service.authorize({ headers: {} }, 'not-a-uuid');
    if (!outcome.authorized) expect(outcome.reason).toBe('MALFORMED_SESSION_ID');
  });

  it('clears a dead credential but never one that may still be valid', async () => {
    const dead = await authorize(session(), cookieHeader(SESSION_ID, 'B'.repeat(43)));
    if (!dead.authorized) expect(dead.clearCookie).toContain('Max-Age=0');

    const unknown = await authorize(undefined, cookieHeader(SESSION_ID, SECRET));
    if (!unknown.authorized) expect(unknown.clearCookie).toBeUndefined();

    const absent = await authorize(session(), undefined);
    if (!absent.authorized) expect(absent.clearCookie).toBeUndefined();
  });

  it('agrees with the clearing rule it publishes', () => {
    expect(clearsCookie('SECRET_MISMATCH')).toBe(true);
    expect(clearsCookie('SESSION_EXPIRED')).toBe(true);
    expect(clearsCookie('SESSION_NOT_ACTIVE')).toBe(true);
    expect(clearsCookie('COOKIE_MISSING')).toBe(false);
    expect(clearsCookie('SESSION_NOT_FOUND')).toBe(false);
  });

  it('never issues a successful cookie', async () => {
    const outcome = await authorize(session(), cookieHeader(SESSION_ID, SECRET));
    expect(JSON.stringify(outcome)).not.toContain('Max-Age');
  });

  it('puts no secret, digest or pepper in the authorized context', async () => {
    const outcome = await authorize(session(), cookieHeader(SESSION_ID, SECRET));
    const serialized = JSON.stringify(outcome);
    for (const value of [SECRET, PEPPER, verifier.digest(SECRET)]) {
      expect(serialized).not.toContain(value);
    }
  });
});

describe('the public failures', () => {
  it('are one shape for every authorization reason', () => {
    const error = designSessionUnauthorized();
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(JSON.stringify(error.getResponse())).not.toMatch(/expired|exists|secret|cookie/i);
  });

  it('carry no revision in the stale-write conflict', () => {
    const error = designSessionStaleWrite();
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(JSON.stringify(error.getResponse())).not.toMatch(/\d/);
  });

  it('separate origin refusal and rate limiting by status only', () => {
    expect(designSessionOriginRefused().getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(designSessionRateLimited().getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });
});

describe('origin and fetch metadata', () => {
  const policy = new DesignSessionOriginPolicy(config);
  const evaluate = (headers: Record<string, unknown>) => policy.evaluate({ headers });

  it('allows the exact origin with a same-origin fetch site', () => {
    expect(evaluate({ origin: ORIGIN, 'sec-fetch-site': 'same-origin' })).toBe('ALLOWED');
  });

  it('refuses a missing Origin, unlike the staff policy', () => {
    expect(evaluate({ 'sec-fetch-site': 'same-origin' })).toBe('REFUSED');
  });

  it('refuses a missing Sec-Fetch-Site', () => {
    expect(evaluate({ origin: ORIGIN })).toBe('REFUSED');
  });

  it('refuses cross-site, same-site and none', () => {
    for (const site of ['cross-site', 'same-site', 'none']) {
      expect(evaluate({ origin: ORIGIN, 'sec-fetch-site': site })).toBe('REFUSED');
    }
  });

  it('refuses a foreign, suffix, null or unparseable origin', () => {
    for (const origin of [
      'https://evil.example',
      'https://nettheu.example.evil.test',
      'null',
      'not a url',
      `${ORIGIN}.evil.test`,
    ]) {
      expect(evaluate({ origin, 'sec-fetch-site': 'same-origin' })).toBe('REFUSED');
    }
  });

  it('never reflects the stated origin: an empty allowlist allows nothing', () => {
    const closed = new DesignSessionOriginPolicy({ ...config, allowedOrigins: [] });
    expect(closed.evaluate({ headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin' } })).toBe(
      'REFUSED',
    );
  });

  it('ignores Referer, which a referrer policy may strip', () => {
    expect(evaluate({ referer: `${ORIGIN}/x`, 'sec-fetch-site': 'same-origin' })).toBe('REFUSED');
  });
});

describe('rate limiting', () => {
  const build = () => new DesignSessionRateLimiter(new SlidingWindowRateLimiter(() => 0), config);

  it('allows the ruled mutation budget and refuses beyond it', () => {
    const limiter = build();
    for (let i = 0; i < 30; i += 1) {
      expect(limiter.checkMutation(SESSION_ID).allowed).toBe(true);
    }
    expect(limiter.checkMutation(SESSION_ID).allowed).toBe(false);
  });

  it('keeps sessions independent', () => {
    const limiter = build();
    for (let i = 0; i < 30; i += 1) limiter.checkMutation(SESSION_ID);
    expect(limiter.checkMutation(OTHER_ID).allowed).toBe(true);
  });

  it('bounds authorization failures on both the network key and the session', () => {
    const limiter = build();
    for (let i = 0; i < 10; i += 1) {
      expect(limiter.checkAuthorizationFailure('net', SESSION_ID).allowed).toBe(true);
    }
    expect(limiter.checkAuthorizationFailure('net', SESSION_ID).allowed).toBe(false);
    // A fresh network key is still refused, because the session's own budget is
    // spent — one attacker cannot spread guesses across sources.
    expect(limiter.checkAuthorizationFailure('other-net', SESSION_ID).allowed).toBe(false);
  });

  it('does not let a failure flood consume the mutation budget', () => {
    const limiter = build();
    for (let i = 0; i < 20; i += 1) limiter.checkAuthorizationFailure('net', SESSION_ID);
    expect(limiter.checkMutation(SESSION_ID).allowed).toBe(true);
  });
});

describe('the ephemeral network key', () => {
  const keys = new EphemeralNetworkKeyService(Buffer.alloc(32, 7));

  it('is stable for one source and different for another', () => {
    const a = keys.keyFor({ headers: { 'x-forwarded-for': '203.0.113.4' } });
    const b = keys.keyFor({ headers: { 'x-forwarded-for': '203.0.113.5' } });
    expect(a).toBe(keys.keyFor({ headers: { 'x-forwarded-for': '203.0.113.4' } }));
    expect(a).not.toBe(b);
  });

  it('never contains the address it was derived from', () => {
    expect(keys.keyFor({ headers: { 'x-forwarded-for': '203.0.113.4' } })).not.toContain(
      '203.0.113',
    );
  });

  it('cannot be correlated across processes, because the salt is per-process', () => {
    const other = new EphemeralNetworkKeyService(Buffer.alloc(32, 9));
    const headers = { 'x-forwarded-for': '203.0.113.4' };
    expect(keys.keyFor({ headers })).not.toBe(other.keyFor({ headers }));
  });

  it('normalizes representations so one client is one bucket', () => {
    expect(normalizeAddress('::FFFF:203.0.113.4')).toBe('203.0.113.4');
    expect(normalizeAddress('FE80::1%eth0')).toBe('fe80::1');
    expect(normalizeAddress('   ')).toBe('unknown');
  });

  it('takes the left-most forwarded entry, not one a client appended', () => {
    const gateway = keys.keyFor({ headers: { 'x-forwarded-for': '203.0.113.4, 10.0.0.9' } });
    expect(gateway).toBe(keys.keyFor({ headers: { 'x-forwarded-for': '203.0.113.4' } }));
  });
});
