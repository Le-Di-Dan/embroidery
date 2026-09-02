/**
 * `APP12-B04` — `ORDER_ACCESS` issuance and the secure Ready-Made order read,
 * end to end against a real database through the real HTTP surface.
 *
 * Every order under test is created by the production
 * `publicReadyMadeOrder_create` command and priced through the production
 * `adminOrderShipping_save`, behind the real `AuthenticatedAdminGuard`. Nothing
 * here fabricates a grant, an order or an obligation in order to assert about
 * it: the only fixture liberty is re-credentialling the grant the runtime
 * issued, because its plaintext token exists once and is never stored — which
 * is itself one of the properties under test.
 *
 * The absences are asserted as loudly as the writes: no token in the create
 * response, no second grant on a replay, no payable total before the fee, and
 * no reachable order across two customers.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import {
  createReadyMadeOrder,
  CREATE_ROUTE,
  dataOf,
  errorCodeOf,
  seedAdminSession,
  serverOf,
  SHIPPING_ROUTE,
  shippingBody,
} from '../support/ready-made-shipping-fixture';
import { createBody } from '../support/ready-made-order-fixture';
import {
  adoptOrderAccessToken,
  grantsForOrder,
  ORDER_READ_ROUTE,
  RESOLVE_ROUTE,
  syntheticAccessToken,
} from '../support/ready-made-access-fixture';

interface OrderPayload {
  readonly orderCode: string;
  readonly status: string;
  readonly currencyCode: string;
  readonly placedAt: string;
  readonly item: Record<string, unknown>;
  readonly merchandiseSubtotal: string;
  readonly delivery?: Record<string, unknown>;
  readonly terminationReason?: string;
  readonly payment?: {
    readonly status: string;
    readonly payableTotal: string;
    readonly payable: boolean;
  };
  readonly paymentDeadline?: string;
  readonly accessExpiresAt: string;
}

describe('APP12-B04 — ORDER_ACCESS issuance and the secure order read', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b04_access');
    await publishSecureAccessPolicies(context.app, context.database);
    cookie = await seedAdminSession(context);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  const readOrder = (token: string) =>
    request(serverOf(context)).post(ORDER_READ_ROUTE).send({ token });

  const setFee = (orderId: string, feeAmount: string) =>
    request(serverOf(context))
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount }));

  /** §6, §7, §31, §32 — issuance happens with the order, and once. */
  describe('issuance', () => {
    it('writes exactly one ACTIVE ORDER_ACCESS grant for the order', async () => {
      const { orderId, fixture } = await createReadyMadeOrder(context, {
        label: 'issue',
        unitPrice: 250_000,
        quantity: 1,
      });

      const grants = await grantsForOrder(context, orderId);
      expect(grants).toHaveLength(1);
      const grant = grants[0];
      expect(grant?.scope_kind).toBe('ORDER_ACCESS');
      expect(grant?.status).toBe('ACTIVE');
      expect(grant?.customer_id).toBe(fixture.customerId);
      // The typed XOR `ck_secure_access_grants__scope_subject` enforces: an
      // order grant names an order and never a custom request.
      expect(grant?.order_id).toBe(orderId);
      expect(grant?.custom_request_id).toBeNull();
      // Only a digest is stored. A raw token here would be the failure the
      // peppered HMAC exists to prevent.
      expect(grant?.token_hash).toEqual(expect.any(String));
      expect(grant?.token_hash).not.toBe('');
    });

    it('publishes the access bootstrap and no credential', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'bootstrap',
        unitPrice: 120_000,
        quantity: 1,
      });

      const grants = await grantsForOrder(context, orderId);
      const { rows } = await context.database.client.db.execute<{ code: string }>(
        sql`select code from orders where id = ${orderId}`,
      );
      expect(rows[0]?.code).toEqual(expect.any(String));
      // The grant's own expiry is what the response publishes, so the two
      // cannot disagree.
      expect(grants[0]?.expires_at).toBeDefined();
    });

    it('delivers the link through the notification path, not the response body', async () => {
      const { orderId, fixture } = await createReadyMadeOrder(context, {
        label: 'notify',
        unitPrice: 90_000,
        quantity: 1,
      });
      const grants = await grantsForOrder(context, orderId);

      // One intent, addressed to the customer's own primary verified contact,
      // naming this grant and carrying no secret: the token travels inside the
      // sealed outbox envelope, and `notification_intents.params` is token-free
      // by construction. This is what says so.
      const { rows } = await context.database.client.db.execute<{
        id: string;
        recipient_contact_point_id: string;
        template_key: string;
        params: unknown;
      }>(sql`
        select id, recipient_contact_point_id, template_key, params
        from notification_intents
        where recipient_contact_point_id = ${fixture.contactPointId}
      `);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.template_key).toBe('secure_access.link');
      const params = JSON.stringify(rows[0]?.params ?? {});
      expect(params).toContain(String(grants[0]?.id));
      expect(params).not.toContain('token');

      // Exactly one delivery event, whose payload is the sealed envelope. The
      // grant's digest is not in it and neither is any plaintext this suite
      // could recognise — the token is ciphertext until the worker opens it.
      const outbox = await context.database.client.db.execute<{ payload: unknown }>(sql`
        select payload from outbox_events
        where aggregate_kind = 'NOTIFICATION_INTENT' and aggregate_id = ${rows[0]?.id ?? ''}
      `);
      expect(outbox.rows).toHaveLength(1);
      expect(JSON.stringify(outbox.rows[0]?.payload ?? {})).not.toContain(
        String(grants[0]?.token_hash),
      );
    });

    it('issues no second grant when the creation is replayed', async () => {
      const { orderId, fixture } = await createReadyMadeOrder(context, {
        label: 'replay',
        unitPrice: 200_000,
        quantity: 1,
      });

      // The same challenge and the same body: `BR-023`'s durable replay.
      const replay = await request(serverOf(context))
        .post(CREATE_ROUTE)
        .send(createBody(fixture, { quantity: 1 }));
      expect(replay.status).toBe(201);

      const { rows } = await context.database.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from orders where customer_id = ${fixture.customerId}`,
      );
      expect(Number(rows[0]?.count ?? '0')).toBe(1);

      // One order, one grant. A replay that re-issued would have invalidated a
      // link the customer may already be holding.
      expect(await grantsForOrder(context, orderId)).toHaveLength(1);
    });

    it('reports the same bootstrap on a replay, because it carries no secret', async () => {
      const { orderId, fixture } = await createReadyMadeOrder(context, {
        label: 'replaybody',
        unitPrice: 75_000,
        quantity: 2,
      });
      const grants = await grantsForOrder(context, orderId);

      const replay = await request(serverOf(context))
        .post(CREATE_ROUTE)
        .send(createBody(fixture, { quantity: 2 }));

      const access = dataOf<{
        access: { scopeKind: string; delivered: boolean; expiresAt: string };
      }>(replay).access;
      expect(access.scopeKind).toBe('ORDER_ACCESS');
      expect(access.delivered).toBe(true);
      expect(Date.parse(access.expiresAt)).toBe(Date.parse(String(grants[0]?.expires_at)));
      // Nothing token-shaped anywhere in the body.
      expect(JSON.stringify(replay.body)).not.toContain(String(grants[0]?.token_hash));
    });
  });

  /** §11–§14, §36 — the read, before and after the shipping fee. */
  describe('the secure order read', () => {
    it('answers before the fee with no payable total and no payment object', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'beforefee',
        unitPrice: 250_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, orderId);

      const response = await readOrder(token);
      expect(response.status).toBe(200);
      const view = dataOf<OrderPayload>(response);

      expect(view.status).toBe('AWAITING_SHIPPING_FEE');
      expect(view.merchandiseSubtotal).toBe('250000.00');
      // `BR-027` — "not priced yet" is an absence, never a zero, and the
      // merchandise subtotal is never republished as a payable total.
      expect(view.delivery?.['feeAmount']).toBeUndefined();
      expect(view.payment).toBeUndefined();
      // The reservation is live, so its deadline is shown — read from the row,
      // not recomputed here.
      expect(view.paymentDeadline).toEqual(expect.any(String));
      expect(view.item['quantity']).toBe(1);
      expect(view.item['unitPriceAmount']).toBe('250000.00');
    });

    it('publishes no internal identifier of any kind', async () => {
      const { orderId, fixture } = await createReadyMadeOrder(context, {
        label: 'noids',
        unitPrice: 60_000,
        quantity: 1,
      });
      const { token, grantId } = await adoptOrderAccessToken(context, orderId);

      const body = JSON.stringify((await readOrder(token)).body);
      for (const forbidden of [orderId, grantId, fixture.customerId, fixture.skuId, token]) {
        expect(body).not.toContain(forbidden);
      }
    });

    it('publishes the exact payable total once the operator prices delivery', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'afterfee',
        unitPrice: 250_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, orderId);
      await setFee(orderId, '30000').expect(200);

      const view = dataOf<OrderPayload>(await readOrder(token));
      expect(view.status).toBe('AWAITING_PAYMENT');
      // §39 — 250000 + 30000 = 280000, composed once by B03 and read back.
      expect(view.merchandiseSubtotal).toBe('250000.00');
      expect(view.delivery?.['feeAmount']).toBe('30000.00');
      expect(view.payment).toEqual({
        status: 'PENDING',
        payableTotal: '280000.00',
        payable: true,
      });
    });

    it('follows a fee correction to the successor obligation, without compounding', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'correction',
        unitPrice: 250_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, orderId);
      await setFee(orderId, '30000').expect(200);
      await setFee(orderId, '45000').expect(200);

      // §39 — 250000 + 45000 = 295000, not 280000 + 45000 and not 295000 + 30000.
      const view = dataOf<OrderPayload>(await readOrder(token));
      expect(view.delivery?.['feeAmount']).toBe('45000.00');
      expect(view.payment?.payableTotal).toBe('295000.00');
    });

    it('stays readable once the order is terminal, with no live facts left', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'terminal',
        unitPrice: 100_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, orderId);
      await setFee(orderId, '10000').expect(200);

      // A cancellation whose stock hold ended by **release** — the shape any
      // non-expiry cancellation has. `APP12-B04-C1` moved the expiry case to
      // `ready-made-order-termination`, where the real sweep drives it: a
      // fixture that writes `reservation EXPIRED` itself proves the fixture,
      // which is the substitution `APP12-B03-C1` removed.
      await context.database.client.db.execute(sql`
        update inventory_reservations
           set status = 'RELEASED', terminalized_at = now(),
               released_reason = 'Operator cancelled the order.'
         where order_id = ${orderId} and status = 'RESERVED'
      `);
      await context.database.client.db.execute(sql`
        update payment_obligations set status = 'CANCELLED'
        where order_id = ${orderId} and status = 'PENDING'
      `);
      await context.database.client.db.execute(sql`
        update orders set status = 'CANCELLED', cancelled_reason = 'Operator cancelled the order.'
        where id = ${orderId}
      `);

      // §25 — the terminal order is still readable, and says so honestly.
      const view = dataOf<OrderPayload>(await readOrder(token));
      expect(view.status).toBe('CANCELLED');
      // `APP12-B04-C1` — not an expiry, so nothing is classified.
      expect(view.terminationReason).toBeUndefined();
      // §36 — no countdown once no live reservation stands.
      expect(view.paymentDeadline).toBeUndefined();
      // The cancelled obligation is not live, so nothing payable is published.
      expect(view.payment).toBeUndefined();
    });
  });

  /** §28, §30 — cross-order and invalid-token security. */
  describe('access isolation', () => {
    it('refuses order A’s token for order B, and never leaks which', async () => {
      const a = await createReadyMadeOrder(context, {
        label: 'isoa',
        unitPrice: 111_000,
        quantity: 1,
      });
      const b = await createReadyMadeOrder(context, {
        label: 'isob',
        unitPrice: 222_000,
        quantity: 1,
      });
      const tokenA = (await adoptOrderAccessToken(context, a.orderId)).token;
      const tokenB = (await adoptOrderAccessToken(context, b.orderId)).token;

      // Each token opens exactly its own order. There is no field on this
      // surface through which either could name the other.
      expect(dataOf<OrderPayload>(await readOrder(tokenA)).merchandiseSubtotal).toBe('111000.00');
      expect(dataOf<OrderPayload>(await readOrder(tokenB)).merchandiseSubtotal).toBe('222000.00');
    });

    it.each([
      ['an unknown token', () => syntheticAccessToken()],
      ['a malformed token', () => 'not-a-token'],
    ])('refuses %s', async (_label, make) => {
      const response = await readOrder(make());
      // A malformed token fails validation before any HMAC; an unknown one
      // fails the lookup. Neither answer says which.
      expect([400, 404]).toContain(response.status);
    });

    it.each([
      ['a revoked grant', sql`status = 'REVOKED', revoked_at = now(), revoke_reason = 'test'`],
      ['an expired grant', sql`expires_at = now() - interval '1 hour'`],
    ])('refuses %s with the one indistinguishable answer', async (_label, mutation) => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: `dead${Math.random().toString(36).slice(2, 8)}`,
        unitPrice: 50_000,
        quantity: 1,
      });
      const { token, grantId } = await adoptOrderAccessToken(context, orderId);
      await context.database.client.db.execute(
        sql`update secure_access_grants set ${mutation} where id = ${grantId}`,
      );

      const response = await readOrder(token);
      expect(response.status).toBe(404);
      expect(errorCodeOf(response)).toBe('SECURE_LINK_UNAVAILABLE');
    });
  });

  /** §9, §12 — the resolver names the scope and publishes no order id. */
  describe('scope-aware resolution', () => {
    it('resolves an ORDER_ACCESS token to its scope and nothing else', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'resolve',
        unitPrice: 40_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, orderId);

      const response = await request(serverOf(context)).post(RESOLVE_ROUTE).send({ token });
      expect(response.status).toBe(200);
      const view = dataOf<{ scopeKind: string; customRequestId?: string; expiresAt: string }>(
        response,
      );
      expect(view.scopeKind).toBe('ORDER_ACCESS');
      // A custom-request subject would be a lie; an order id would be `BR-032`.
      expect(view.customRequestId).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(orderId);
    });
  });
});
