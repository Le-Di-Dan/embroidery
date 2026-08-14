/**
 * `APP4-B06` — the transport-abuse limit on the public resolver.
 *
 * The published budget is 30 requests per source per minute, so the suite makes
 * 31 real HTTP calls rather than asserting against a smaller stand-in: the
 * boundary is the behaviour, and a test tuned to 3 would not notice the day the
 * limiter started reading the wrong field.
 *
 * The platform limiter's clock is replaced with one the suite advances by hand,
 * so a sixty-second window is provable in milliseconds. Nothing sleeps.
 *
 * The claim that matters most is **outcome independence**: a valid token and a
 * garbage token must cost exactly the same. A limiter that charged only for
 * failures would let a caller read a token's validity off their own remaining
 * budget — the oracle the single 404 exists to prevent, reintroduced through
 * the side door.
 */
import { SlidingWindowRateLimiter } from '../../src/platform/rate-limit/sliding-window-rate-limiter';
import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../src/modules/customer/domain/grant/secure-link-policy';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  RESOLVE_POLICY,
  applyApp4SecretEnv,
  publishPolicy,
  seedGrant,
  syntheticToken,
  type SeededGrant,
} from '../support/secure-link-fixture';

const RESOLVE_PATH = '/api/public/secure-links/resolve';
const WINDOW_MS = 60_000;

/** A clock the suite owns. Starts at a fixed instant and only moves on request. */
class FakeClock {
  private current = Date.parse('2026-08-14T09:00:00.000Z');

  readonly now = (): number => this.current;

  advanceMs(milliseconds: number): void {
    this.current += milliseconds;
  }
}

describe('APP4-B06 secure-link resolve rate limit (API)', () => {
  let context: ApiIntegrationTestContext;
  let clock: FakeClock;
  let live: SeededGrant;
  let restoreSecretEnv: () => void;

  beforeAll(async () => {
    restoreSecretEnv = applyApp4SecretEnv();
    clock = new FakeClock();
    context = await createApiIntegrationContext('app4_b06_rate', (builder) =>
      builder
        .overrideProvider(SlidingWindowRateLimiter)
        .useValue(new SlidingWindowRateLimiter(clock.now)),
    );
    await publishPolicy(
      context.app,
      context.database,
      SECURE_LINK_RESOLVE_POLICY_KEY,
      RESOLVE_POLICY,
    );
    live = await seedGrant(context.database, { label: 'ratelive' });
  }, 180_000);

  afterAll(async () => {
    await context?.close();
    restoreSecretEnv?.();
  });

  /** A fresh source per test, so one test's spent budget cannot fail the next. */
  const from = (
    source: string,
    token: string,
  ): ReturnType<ApiIntegrationTestContext['http']['post']> =>
    context.http
      .post(RESOLVE_PATH)
      // The gateway appends the real client, so the right-most entry is the one
      // the limiter must key on.
      .set('X-Forwarded-For', source)
      .send({ token });

  it('allows the published budget and refuses the next request', async () => {
    const source = '203.0.113.10';

    for (let attempt = 1; attempt <= RESOLVE_POLICY.maxRequestsPerIpPerMinute; attempt += 1) {
      const response = await from(source, live.token);
      expect({ attempt, status: response.status }).toEqual({ attempt, status: 200 });
    }

    const refused = await from(source, live.token);
    expect(refused.status).toBe(429);
    expect((refused.body as { code?: string }).code).toBe('TOO_MANY_REQUESTS');
    // Whole seconds, and never zero while the window is still closed.
    const retryAfter = Number(refused.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(WINDOW_MS / 1_000);
  });

  it('charges a failing token exactly as much as a succeeding one', async () => {
    const source = '203.0.113.11';
    const budget = RESOLVE_POLICY.maxRequestsPerIpPerMinute;

    // Spend the whole budget on tokens that resolve to nothing.
    for (let attempt = 1; attempt <= budget; attempt += 1) {
      const response = await from(source, syntheticToken(`miss${String(attempt)}`));
      expect({ attempt, status: response.status }).toEqual({ attempt, status: 404 });
    }

    // The budget is spent, and a *valid* token cannot buy its way past it. If
    // failures were free this would answer 200 and the limiter would be an
    // oracle.
    const refused = await from(source, live.token);
    expect(refused.status).toBe(429);
  });

  it('lets the source through again once the window has passed', async () => {
    const source = '203.0.113.12';
    const budget = RESOLVE_POLICY.maxRequestsPerIpPerMinute;

    for (let attempt = 1; attempt <= budget; attempt += 1) {
      await from(source, live.token).expect(200);
    }
    await from(source, live.token).expect(429);

    // No sleep: the window is a function of the injected clock.
    clock.advanceMs(WINDOW_MS + 1_000);

    await from(source, live.token).expect(200);
  });

  it('keys on the entry the gateway appended, not one the client forged', async () => {
    // `X-Forwarded-For: <forged>, <realClient>` is what nginx's
    // `$proxy_add_x_forwarded_for` produces when a client sends its own header.
    // Reading the left-most entry — the plausible mistake, and the one APP3-E01
    // actually found in production code — would let a caller mint a fresh bucket
    // per request and bypass the limit entirely.
    const realClient = '203.0.113.13';
    const budget = RESOLVE_POLICY.maxRequestsPerIpPerMinute;

    for (let attempt = 1; attempt <= budget; attempt += 1) {
      await from(`198.51.100.${String(attempt)}, ${realClient}`, live.token).expect(200);
    }

    // A brand-new forged left-most entry, same real client. Still refused.
    const refused = await from(`198.51.100.254, ${realClient}`, live.token);
    expect(refused.status).toBe(429);
  });

  it('counts distinct sources separately', async () => {
    const budget = RESOLVE_POLICY.maxRequestsPerIpPerMinute;
    for (let attempt = 1; attempt <= budget; attempt += 1) {
      await from('203.0.113.14', live.token).expect(200);
    }
    await from('203.0.113.14', live.token).expect(429);

    // A different source is unaffected — the limit bounds abuse, not the endpoint.
    await from('203.0.113.15', live.token).expect(200);
  });

  it('fails closed when the abuse policy is unpublished or malformed', async () => {
    await publishPolicy(context.app, context.database, SECURE_LINK_RESOLVE_POLICY_KEY, {
      maxRequestsPerIpPerMinute: 'thirty',
    });

    // 503, not 404: an unconfigured limiter is a fact about the server, and the
    // answer is identical for a valid token, so it discloses nothing.
    const response = await from('203.0.113.16', live.token);
    expect(response.status).toBe(503);

    await publishPolicy(
      context.app,
      context.database,
      SECURE_LINK_RESOLVE_POLICY_KEY,
      RESOLVE_POLICY,
    );
  });
});
