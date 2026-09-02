/**
 * `APP4-B06` — the public secure-link resolver over real HTTP.
 *
 * The whole application, the real controller, the real global validation pipe
 * and exception filter, the real repository and the real audit trail, against a
 * disposable PostgreSQL with every migration applied. Nothing is mocked, because
 * every claim here is about what a caller on the wire can observe.
 *
 * The centre of the suite is the six-cause equivalence table. A resolver that
 * answered `404` for five causes and `410` for expiry would pass a happy-path
 * test and hand an attacker a validity oracle, so the causes are built as real
 * persistence states and their responses are compared to each other rather than
 * to a literal.
 */
import { sql } from 'drizzle-orm';

import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../src/modules/customer/domain/grant/secure-link-policy';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
  applyWave2ReleasedEnv,
} from '../support/api-integration-context';
import {
  RESOLVE_POLICY,
  TEST_LINK_PEPPER,
  applyApp4SecretEnv,
  expectedDigest,
  publishPolicy,
  seedGrant,
  syntheticToken,
  type SeededGrant,
} from '../support/secure-link-fixture';

/** The success envelope, typed once so no assertion reaches through `any`. */
interface ResolutionEnvelope {
  readonly code?: string;
  readonly data?: {
    readonly customRequestId?: string;
    readonly scopeKind?: string;
    readonly expiresAt?: string;
  };
}

const resolved = (body: unknown): ResolutionEnvelope => body as ResolutionEnvelope;

const RESOLVE_PATH = '/api/public/secure-links/resolve';

describe('APP4-B06 public secure-link resolution (API)', () => {
  let context: ApiIntegrationTestContext;
  let restoreWave2: () => void;
  let restoreSecretEnv: () => void;

  beforeAll(async () => {
    restoreSecretEnv = applyApp4SecretEnv();
    // `APP12-G02` withholds every Wave-2 customer operation by default, so a
    // suite proving Wave-2 behaviour has to run in the wave that releases it.
    // Set before the context is built: the gate reads the value once, at module
    // composition (`APP12-B04` §48).
    restoreWave2 = applyWave2ReleasedEnv();
    context = await createApiIntegrationContext('app4_b06_resolve');
    await publishPolicy(context.app, context.database, SECURE_LINK_RESOLVE_POLICY_KEY, {
      ...RESOLVE_POLICY,
      // A generous ceiling for this suite: the limiter has its own file, and a
      // 30-request budget shared across these cases would make an unrelated
      // assertion fail as a 429 the day someone adds a seventh case.
      maxRequestsPerIpPerMinute: 500,
    });
  }, 180_000);

  afterAll(async () => {
    await context?.close();
    restoreWave2?.();
    restoreSecretEnv?.();
  });

  beforeEach(() => {
    context.logs.records.length = 0;
  });

  const resolve = (token: string): ReturnType<ApiIntegrationTestContext['http']['post']> =>
    context.http.post(RESOLVE_PATH).send({ token });

  describe('a live link', () => {
    let live: SeededGrant;

    beforeAll(async () => {
      live = await seedGrant(context.database, { label: 'live' });
    });

    it('resolves from the body token alone and returns the safe projection', async () => {
      const response = await resolve(live.token).expect(200);

      expect(resolved(response.body).data).toEqual({
        customRequestId: live.customRequestId,
        scopeKind: 'REQUEST_ACCESS',
        expiresAt: expect.any(String) as string,
      });
      expect(resolved(response.body).code).toBe('SECURE_LINK_RESOLVED');
    });

    it('returns no token, digest, grant, customer or contact', async () => {
      const response = await resolve(live.token).expect(200);
      const serialized = JSON.stringify(response.body);

      expect(serialized).not.toContain(live.token);
      expect(serialized).not.toContain(expectedDigest(live.token));
      expect(serialized).not.toContain(live.grantId);
      expect(serialized).not.toContain(live.customerId);
      expect(serialized).not.toContain('@example.com');
      // The projection is closed: three fields and nothing a later edit slipped in.
      expect(Object.keys(resolved(response.body).data as object).sort()).toEqual([
        'customRequestId',
        'expiresAt',
        'scopeKind',
      ]);
    });

    it('does not consume the grant — the same link resolves again, unchanged', async () => {
      const before = await grantRow(live.grantId);
      await resolve(live.token).expect(200);
      await resolve(live.token).expect(200);
      const after = await grantRow(live.grantId);

      // ADR-DB3-004 r2: multi-use within validity. A resolver that revoked or
      // rotated on use would break a customer revisiting their own request.
      expect(after).toEqual(before);
      expect(after?.status).toBe('ACTIVE');
    });

    it('audits the use with the grant as its own actor, and names no secret', async () => {
      await resolve(live.token).expect(200);
      const events = await auditRows();
      const resolvedEvents = events.filter((row) => row.action === 'secure_link.resolved');

      expect(resolvedEvents.length).toBeGreaterThan(0);
      expect(resolvedEvents[0]).toMatchObject({
        actor_kind: 'CUSTOMER',
        target_kind: 'SECURE_ACCESS_GRANT',
        target_id: live.grantId,
      });

      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(live.token);
      expect(serialized).not.toContain(expectedDigest(live.token));
    });
  });

  describe('the unavailable causes are externally identical', () => {
    /**
     * One well-formed token per **reachable** cause.
     *
     * Five of the six causes are real persistence states and are seeded as such:
     * unknown, expired, revoked, superseded, and an `EXPIRED`-status row that is
     * neither expired-by-clock nor revoked. The sixth pair — *wrong target* and
     * *wrong scope* — is **unreachable through this endpoint by construction**,
     * and that is a stronger property than a test of it would be:
     *
     * - **wrong target** cannot be expressed. The request has no field for a
     *   customer or a request, and the resolver reads the target *from the grant
     *   row*, so there is no pair for a caller to get wrong. `should only ever
     *   open its own target` below proves the binding positively instead.
     * - **wrong scope** cannot be stored. `GRANT_SCOPE_KINDS` has exactly one
     *   member and `ck_secure_access_grants__scope_kind_allowed` refuses any
     *   other value, so no row can exist for the predicate to reject. The
     *   predicate itself is exercised where it *is* expressible — directly
     *   against the repository, in `secure-link-repository.integration.spec.ts`.
     *
     * Inventing rows for the two unreachable causes would mean disabling a CHECK
     * or adding a request field, i.e. breaking the guarantee in order to test it.
     */
    let cases: { readonly cause: string; readonly token: string }[];

    beforeAll(async () => {
      const expired = await seedGrant(context.database, {
        label: 'expired',
        expiresInHours: -1,
      });
      const revoked = await seedGrant(context.database, {
        label: 'revoked',
        status: 'REVOKED',
        revokeReason: 'admin withdrew it',
      });
      const replacement = await seedGrant(context.database, { label: 'replacement' });
      const superseded = await seedGrant(context.database, {
        label: 'superseded',
        status: 'REVOKED',
        revokeReason: 'superseded',
        supersededBy: replacement.grantId,
      });
      // An LC-03 `EXPIRED` row whose clock has not yet passed: swept state and
      // wall-clock expiry are different facts, and both must refuse.
      const swept = await seedGrant(context.database, { label: 'swept' });
      await context.database.client.db.execute(sql`
        update secure_access_grants set status = 'EXPIRED' where id = ${swept.grantId}
      `);

      cases = [
        { cause: 'unknown token', token: syntheticToken('unknownnn') },
        { cause: 'expired by clock', token: expired.token },
        { cause: 'revoked grant', token: revoked.token },
        { cause: 'superseded grant', token: superseded.token },
        { cause: 'swept to EXPIRED', token: swept.token },
      ];
    });

    it('should only ever open its own target', async () => {
      // The positive form of "wrong target". Two live grants exist; each token
      // returns its own request and can never be steered to the other's, because
      // there is no field in which to steer it.
      const first = await seedGrant(context.database, { label: 'targetone' });
      const second = await seedGrant(context.database, { label: 'targettwo' });

      const one = await resolve(first.token).expect(200);
      const two = await resolve(second.token).expect(200);

      expect(resolved(one.body).data?.customRequestId).toBe(first.customRequestId);
      expect(resolved(two.body).data?.customRequestId).toBe(second.customRequestId);
      expect(resolved(one.body).data?.customRequestId).not.toBe(second.customRequestId);
    });

    it('answers 404 SECURE_LINK_UNAVAILABLE for every cause', async () => {
      for (const { cause, token } of cases) {
        const response = await resolve(token);
        expect({
          cause,
          status: response.status,
          code: (response.body as { code?: string }).code,
        }).toEqual({
          cause,
          status: 404,
          code: 'SECURE_LINK_UNAVAILABLE',
        });
      }
    });

    it('returns byte-identical bodies once the correlation id is normalized', async () => {
      const bodies = await Promise.all(
        cases.map(async ({ token }) => {
          const response = await resolve(token);
          return normalize(response.body);
        }),
      );

      // Compared to each other, never to a literal: a literal would still pass
      // if every cause drifted together, which is the one change that matters.
      const [first] = bodies;
      for (const body of bodies) {
        expect(body).toEqual(first);
      }
    });

    it('exposes no cause-specific header', async () => {
      const headerSets = await Promise.all(
        cases.map(async ({ token }) => {
          const response = await resolve(token);
          return Object.keys(response.headers as Record<string, string>)
            .filter((name) => name !== 'date' && name !== 'content-length')
            .sort();
        }),
      );

      const [first] = headerSets;
      for (const headers of headerSets) {
        expect(headers).toEqual(first);
      }
    });

    it('names no grant, customer or request in any failure body', async () => {
      for (const { token } of cases) {
        const response = await resolve(token);
        const serialized = JSON.stringify(response.body);
        expect(serialized).not.toContain(token);
        expect(serialized).not.toContain(expectedDigest(token));
        expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/i);
      }
    });

    it('audits a generic unavailable outcome with no fabricated identity', async () => {
      context.logs.records.length = 0;
      await resolve(syntheticToken('auditprobe')).expect(404);

      const events = (await auditRows()).filter((row) => row.action === 'secure_link.unavailable');
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1]).toMatchObject({
        // SYSTEM, because no identity exists yet — the `staff.login.failed`
        // precedent. Never a guessed customer.
        actor_kind: 'SYSTEM',
        target_kind: 'SECURE_ACCESS_GRANT',
        target_id: 'secure_link_resolve',
        failure_code: 'SECURE_LINK_UNAVAILABLE',
        customer_id: null,
        grant_id: null,
      });
    });
  });

  describe('the request contract', () => {
    it('rejects a body carrying anything besides the token', async () => {
      const live = await seedGrant(context.database, { label: 'strict' });

      // Each of these would be a distinct security defect if accepted: a
      // caller-asserted target, or a caller-selected scope.
      for (const extra of [
        { customerId: live.customerId },
        { customRequestId: live.customRequestId },
        { grantId: live.grantId },
        { scopeKind: 'REQUEST_ACCESS' },
        { purpose: 'STEP_UP' },
      ]) {
        const response = await context.http
          .post(RESOLVE_PATH)
          .send({ token: live.token, ...extra });
        expect(response.status).toBe(400);
      }
    });

    it('rejects a malformed token without echoing it', async () => {
      const garbage = 'not-a-valid-token';
      const response = await context.http.post(RESOLVE_PATH).send({ token: garbage }).expect(400);

      expect(JSON.stringify(response.body)).not.toContain(garbage);
    });

    it('serves no GET resolver', async () => {
      // A GET would have to carry the token in a path or query, which is exactly
      // what ADR-APP4-001 §11 forbids with no fallback.
      await context.http.get(RESOLVE_PATH).expect(404);
    });
  });

  describe('secrecy', () => {
    it('keeps the token and its digest out of every log record and the request URL', async () => {
      const live = await seedGrant(context.database, { label: 'logging' });
      context.logs.records.length = 0;

      await resolve(live.token).expect(200);
      await resolve(syntheticToken('logmiss')).expect(404);

      const logged = JSON.stringify(context.logs.records);
      expect(logged).not.toContain(live.token);
      expect(logged).not.toContain(expectedDigest(live.token));
      expect(logged).not.toContain(TEST_LINK_PEPPER);

      // The route is logged; the body never is, and the logged route carries no
      // query string for a token to hide in.
      expect(logged).toContain('/public/secure-links/resolve');
      expect(logged).not.toContain('?');
    });

    it('never writes the token or digest to any table', async () => {
      const live = await seedGrant(context.database, { label: 'atrest' });
      await resolve(live.token).expect(200);

      const found = await context.database.client.db.execute<{ source: string }>(sql`
        select 'audit_events' as source from audit_events
        where (action || actor_kind || target_kind || target_id || coalesce(reason, '')
               || coalesce(summary::text, '') || coalesce(failure_code, '') || correlation_id)
              like ${`%${live.token}%`}
        union all
        select 'notification_intents' from notification_intents
        where (intent_key || template_key || params::text) like ${`%${live.token}%`}
      `);
      expect(found.rows).toEqual([]);
    });
  });

  async function grantRow(grantId: string): Promise<Record<string, unknown> | undefined> {
    const result = await context.database.client.db.execute<Record<string, unknown>>(sql`
      select status, token_hash, expires_at, revoked_at, revoke_reason, superseded_by_grant_id
      from secure_access_grants where id = ${grantId}
    `);
    return result.rows[0];
  }

  async function auditRows(): Promise<
    {
      action: string;
      actor_kind: string;
      target_kind: string;
      target_id: string;
      failure_code: string | null;
      customer_id: string | null;
      grant_id: string | null;
    }[]
  > {
    const result = await context.database.client.db.execute<{
      action: string;
      actor_kind: string;
      target_kind: string;
      target_id: string;
      failure_code: string | null;
      customer_id: string | null;
      grant_id: string | null;
    }>(sql`
      select action, actor_kind, target_kind, target_id, failure_code, customer_id, grant_id
      from audit_events where action like 'secure_link.%' order by id
    `);
    return result.rows;
  }
});

/**
 * Blanks the two envelope fields that vary per *request* rather than per cause.
 *
 * `requestId` and `timestamp` are global to every response the platform emits —
 * a 200, a 400 and a 404 all carry them, and they differ between two identical
 * calls a millisecond apart. Normalizing exactly these two is what `APP4-B06` §8
 * permits; nothing cause-specific is touched, so a body that differed for any
 * other reason still fails the comparison.
 */
function normalize(body: unknown): unknown {
  return JSON.parse(
    JSON.stringify(body)
      .replace(/"requestId":"[^"]*"/g, '"requestId":"<normalized>"')
      .replace(/"timestamp":"[^"]*"/g, '"timestamp":"<normalized>"'),
  ) as unknown;
}
