/**
 * `APP12-B04` §9, §10, §29, §47, §48 — `publicSecureLink_resolve` gated by the
 * resolved grant **scope** rather than withheld as a whole operation.
 *
 * `APP12-G02` denied the resolver outright, which was correct while
 * `REQUEST_ACCESS` was its only scope. Now one operation serves both waves and
 * no static rule can separate them, so the decision moved into the resolution
 * path — after the token is digested and the grant row is read, where the wave
 * is knowable.
 *
 * Two booted applications, because the release configuration is read once when
 * the module is composed: a per-request flag would be exactly the mid-flight
 * flip `ReleaseGateModule` refuses to allow. Each context therefore sets
 * `CUSTOM_EMBROIDERY_RELEASE_ENABLED` before it is created and restores it
 * after.
 *
 * Both grants under test are the real thing: the `ORDER_ACCESS` one is issued by
 * the production order-creation command, and the `REQUEST_ACCESS` one is the
 * delivered `APP4-B06` fixture's.
 */
import request from 'supertest';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import { applyApp4SecretEnv, seedGrant } from '../support/secure-link-fixture';
import {
  createReadyMadeOrder,
  dataOf,
  errorCodeOf,
  serverOf,
} from '../support/ready-made-shipping-fixture';
import {
  adoptOrderAccessToken,
  ORDER_READ_ROUTE,
  RESOLVE_ROUTE,
} from '../support/ready-made-access-fixture';

const RELEASE_ENV = 'CUSTOM_EMBROIDERY_RELEASE_ENABLED';

/** Sets the release flag for one booted context, and restores it after. */
function applyReleaseFlag(enabled: boolean): () => void {
  const previous = process.env[RELEASE_ENV];
  process.env[RELEASE_ENV] = String(enabled);
  return () => {
    if (previous === undefined) delete process.env[RELEASE_ENV];
    else process.env[RELEASE_ENV] = previous;
  };
}

interface Resolution {
  readonly scopeKind: string;
  readonly customRequestId?: string;
  readonly expiresAt: string;
}

describe('APP12-B04 — scope-gated secure-link resolution', () => {
  let restoreSecrets: () => void;

  beforeAll(() => {
    // Applied before either context so both digest against one pepper, and so
    // the `REQUEST_ACCESS` fixture's `expectedDigest` matches what the server
    // computes.
    restoreSecrets = applyApp4SecretEnv();
  });

  afterAll(() => {
    restoreSecrets();
  });

  describe('with Wave 2 unreleased', () => {
    let context: ApiIntegrationTestContext;
    let restoreFlag: () => void;

    beforeAll(async () => {
      restoreFlag = applyReleaseFlag(false);
      context = await createApiIntegrationContext('app12_b04_gate_off');
      await publishSecureAccessPolicies(context.app, context.database);
    }, 240_000);

    afterAll(async () => {
      await context?.close();
      restoreFlag();
    });

    const resolve = (token: string) =>
      request(serverOf(context)).post(RESOLVE_ROUTE).send({ token });

    it('resolves an ORDER_ACCESS token — Ready-Made is Wave 1', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'gateoff',
        unitPrice: 100_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, orderId);

      const response = await resolve(token);
      expect(response.status).toBe(200);
      expect(dataOf<Resolution>(response).scopeKind).toBe('ORDER_ACCESS');
    });

    it('withholds a live REQUEST_ACCESS token, indistinguishably', async () => {
      const seeded = await seedGrant(context.database, { label: 'gateoffreq' });

      const response = await resolve(seeded.token);
      // Not 403, and not the guard's bare 404: the same body an unknown token
      // gets, so a Wave-1 deployment does not confirm the link is real.
      expect(response.status).toBe(404);
      expect(errorCodeOf(response)).toBe('SECURE_LINK_UNAVAILABLE');
    });

    it('serves the Ready-Made order read while the custom lanes stay withheld', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'gateoffread',
        unitPrice: 80_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, orderId);

      expect((await request(serverOf(context)).post(ORDER_READ_ROUTE).send({ token })).status).toBe(
        200,
      );

      // The statically withheld custom payment lane is still a bare 404 from
      // the guard, before any body is parsed.
      const deposit = await request(serverOf(context))
        .post('/api/public/orders/deposit')
        .send({ token });
      expect(deposit.status).toBe(404);
      expect(errorCodeOf(deposit)).not.toBe('SECURE_LINK_UNAVAILABLE');
    });
  });

  describe('with Wave 2 released', () => {
    let context: ApiIntegrationTestContext;
    let restoreFlag: () => void;

    beforeAll(async () => {
      restoreFlag = applyReleaseFlag(true);
      context = await createApiIntegrationContext('app12_b04_gate_on');
      await publishSecureAccessPolicies(context.app, context.database);
    }, 240_000);

    afterAll(async () => {
      await context?.close();
      restoreFlag();
    });

    const resolve = (token: string) =>
      request(serverOf(context)).post(RESOLVE_ROUTE).send({ token });

    it('restores REQUEST_ACCESS resolution exactly as APP4-B06 delivered it', async () => {
      const seeded = await seedGrant(context.database, { label: 'gateonreq' });

      const response = await resolve(seeded.token);
      expect(response.status).toBe(200);
      const view = dataOf<Resolution>(response);
      expect(view.scopeKind).toBe('REQUEST_ACCESS');
      expect(view.customRequestId).toBe(seeded.customRequestId);
    });

    it('keeps ORDER_ACCESS working — Wave 1 does not close when Wave 2 opens', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'gateon',
        unitPrice: 100_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, orderId);

      const response = await resolve(token);
      expect(response.status).toBe(200);
      const view = dataOf<Resolution>(response);
      expect(view.scopeKind).toBe('ORDER_ACCESS');
      expect(view.customRequestId).toBeUndefined();
    });

    it('still refuses a custom token on the Ready-Made order read', async () => {
      const seeded = await seedGrant(context.database, { label: 'gateoncross' });

      // Released or not, a `REQUEST_ACCESS` grant opens a request and never an
      // order — and the refusal says nothing about which of the two it was.
      const response = await request(serverOf(context))
        .post(ORDER_READ_ROUTE)
        .send({ token: seeded.token });
      expect(response.status).toBe(404);
      expect(errorCodeOf(response)).toBe('SECURE_LINK_UNAVAILABLE');
    });
  });
});
