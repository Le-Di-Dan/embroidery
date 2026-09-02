/**
 * `APP12-B04-C1` — the machine-readable termination reason on the secure
 * Ready-Made order projection.
 *
 * `APP12-D01` §I renders `CANCELLED` and `EXPIRED` as distinct customer states.
 * The order's lifecycle has one terminal status, so the cause is published
 * beside it — and this suite is what proves the value is a **committed domain
 * fact** rather than an inference a Storefront checkpoint would have to make.
 *
 * ## The expiry case is driven by the real sweep
 *
 * Not by a hand-written `UPDATE`. `APP12-B03` substituted one of those for the
 * sweep and `APP12-B03-C1` removed it, for the reason that applies here too: a
 * fixture that writes `reservation EXPIRED` itself proves the fixture, not the
 * system, and the whole claim of this correction is that the two rows the sweep
 * writes **in one transaction** are what the classification reads. So
 * `ExpireReadyMadeReservationsUseCase` runs where it lives — in the built
 * worker `dist`, in its own OS process, against this suite's disposable
 * database — through the delivered `worker-expiry-process` harness.
 *
 * ## The prose cases are hand-built, deliberately
 *
 * `orders.cancelled_reason` is what those cases are *about*, so they set it
 * directly. Both directions are proved: misleading prose cannot create the
 * classification, and absent prose cannot prevent it.
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
  dataOf,
  obligationsOf,
  reservationOf,
  seedAdminSession,
  serverOf,
  SHIPPING_ROUTE,
  shippingBody,
} from '../support/ready-made-shipping-fixture';
import {
  adoptOrderAccessToken,
  FULL_PAYMENT_ATTEMPTS_ROUTE,
  FULL_PAYMENT_QR_ROUTE,
  FULL_PAYMENT_ROUTE,
  ORDER_READ_ROUTE,
} from '../support/ready-made-access-fixture';
import {
  startWorkerExpiryProcess,
  type WorkerExpiryProcess,
} from '../support/worker-expiry-process';

jest.setTimeout(300_000);

interface OrderPayload {
  readonly status: string;
  readonly terminationReason?: string;
  readonly paymentDeadline?: string;
  readonly payment?: { readonly payable: boolean };
}

describe('APP12-B04-C1 — the Ready-Made termination reason', () => {
  let context: ApiIntegrationTestContext;
  let sweep: WorkerExpiryProcess;
  let cookie: string;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b04c1_termination');
    await publishSecureAccessPolicies(context.app, context.database);
    cookie = await seedAdminSession(context);
    sweep = await startWorkerExpiryProcess(context);
  }, 300_000);

  afterAll(async () => {
    await sweep?.close();
    await context?.close();
  });

  const readOrder = (token: string) =>
    request(serverOf(context)).post(ORDER_READ_ROUTE).send({ token });

  const setFee = (orderId: string, feeAmount: string) =>
    request(serverOf(context))
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount }));

  /** Backdates the order's live reservation so the next real pass finds it due. */
  async function makeDue(orderId: string): Promise<void> {
    await context.database.client.db.execute(sql`
      update inventory_reservations
         set expires_at = now() - interval '1 minute'
       where order_id = ${orderId} and status = 'RESERVED'
    `);
  }

  /** The order's committed status and reason prose, read fresh. */
  async function rowOf(
    orderId: string,
  ): Promise<{ readonly status: string; readonly cancelled_reason: string | null }> {
    const { rows } = await context.database.client.db.execute<{
      status: string;
      cancelled_reason: string | null;
    }>(sql`select status, cancelled_reason from orders where id = ${orderId}`);
    return rows[0] as { status: string; cancelled_reason: string | null };
  }

  /** §10 — the real sweep, end to end, on an order that never reached payment. */
  describe('a reservation that lapsed before the shipping fee', () => {
    it('classifies the order as RESERVATION_EXPIRED', async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'expiryfee',
        unitPrice: 250_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, order.orderId);

      // Live: no reason to publish, because nothing has ended.
      const before = dataOf<OrderPayload>(await readOrder(token));
      expect(before.status).toBe('AWAITING_SHIPPING_FEE');
      expect(before.terminationReason).toBeUndefined();
      expect(before.paymentDeadline).toEqual(expect.any(String));

      await makeDue(order.orderId);
      expect((await sweep.runPass()).expired).toBeGreaterThanOrEqual(1);

      // The two rows the sweep wrote in one transaction.
      expect((await rowOf(order.orderId)).status).toBe('CANCELLED');
      expect((await reservationOf(context, order.orderId)).status).toBe('EXPIRED');

      const after = dataOf<OrderPayload>(await readOrder(token));
      expect(after.status).toBe('CANCELLED');
      expect(after.terminationReason).toBe('RESERVATION_EXPIRED');
      // §10 — and none of the live-order facts survive.
      expect(after.paymentDeadline).toBeUndefined();
      expect(after.payment).toBeUndefined();
      // No raw reservation identifier anywhere in the body.
      const reservation = await reservationOf(context, order.orderId);
      expect(JSON.stringify((await readOrder(token)).body)).not.toContain(reservation.id);
    });
  });

  /** §10, §14 — the same, after the order became payable. */
  describe('a payment window that lapsed', () => {
    it('classifies the order and leaves every payment operation refused', async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'expirypay',
        unitPrice: 250_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, order.orderId);
      await setFee(order.orderId, '30000').expect(200);

      await makeDue(order.orderId);
      expect((await sweep.runPass()).expired).toBeGreaterThanOrEqual(1);

      // `BR-026`'s money half: the live FULL was cancelled with the order.
      const obligations = await obligationsOf(context, order.orderId);
      expect(obligations).toHaveLength(1);
      expect(obligations[0]?.status).toBe('CANCELLED');

      const view = dataOf<OrderPayload>(await readOrder(token));
      expect(view.status).toBe('CANCELLED');
      expect(view.terminationReason).toBe('RESERVATION_EXPIRED');

      // The new field is not payment authority: every payment operation still
      // refuses, exactly as `APP12-B04` delivered them.
      for (const route of [FULL_PAYMENT_ROUTE, FULL_PAYMENT_QR_ROUTE]) {
        expect((await request(serverOf(context)).post(route).send({ token })).status).toBe(404);
      }
      const refused = await request(serverOf(context))
        .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
        .set('Idempotency-Key', `c1-expired-${order.orderId}`)
        .send({ token });
      expect(refused.status).toBe(404);
    });
  });

  /** §11 — a cancellation that is not an expiry is not classified as one. */
  describe('a cancellation whose stock did not lapse', () => {
    it('publishes no termination reason at all', async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'released',
        unitPrice: 90_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, order.orderId);

      // No Ready-Made operator-cancellation command exists yet, so the smallest
      // fixture that preserves the invariants is used: the stock hold ends by
      // RELEASE — which is what any non-expiry cancellation would do — and the
      // order is cancelled with the reason its CHECK requires.
      await context.database.client.db.execute(sql`
        update inventory_reservations
           set status = 'RELEASED', terminalized_at = now(), released_reason = 'Operator cancelled.'
         where order_id = ${order.orderId} and status = 'RESERVED'
      `);
      await context.database.client.db.execute(sql`
        update orders set status = 'CANCELLED', cancelled_reason = 'Operator cancelled the order.'
         where id = ${order.orderId}
      `);

      const view = dataOf<OrderPayload>(await readOrder(token));
      expect(view.status).toBe('CANCELLED');
      // Absent, not a second taxonomy member invented to fill the field.
      expect(view.terminationReason).toBeUndefined();
      expect(Object.keys(dataOf<Record<string, unknown>>(await readOrder(token)))).not.toContain(
        'terminationReason',
      );
    });
  });

  /**
   * §12 — the free-text column is not the authority, in both directions.
   *
   * This is the assertion that would fail the moment someone reintroduced a
   * substring match, which is exactly the shortcut `APP12-B04-C1` §5 forbids.
   */
  describe('orders.cancelled_reason is not the authority', () => {
    it('Case A — prose saying "expired" does not create the classification', async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'prosea',
        unitPrice: 70_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, order.orderId);

      await context.database.client.db.execute(sql`
        update inventory_reservations
           set status = 'RELEASED', terminalized_at = now(), released_reason = 'Operator cancelled.'
         where order_id = ${order.orderId} and status = 'RESERVED'
      `);
      await context.database.client.db.execute(sql`
        update orders
           set status = 'CANCELLED',
               cancelled_reason = 'Reservation window expired before payment was completed.'
         where id = ${order.orderId}
      `);

      // The prose is the sweep's own sentence, word for word, on an order the
      // sweep never touched.
      expect((await rowOf(order.orderId)).cancelled_reason).toContain('expired');
      expect(dataOf<OrderPayload>(await readOrder(token)).terminationReason).toBeUndefined();
    });

    it('Case B — prose that never says "expired" does not prevent it', async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'proseb',
        unitPrice: 80_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, order.orderId);

      await makeDue(order.orderId);
      expect((await sweep.runPass()).expired).toBeGreaterThanOrEqual(1);

      // The sweep's own prose is rewritten to something that shares no word
      // with the classification. The reservation row is untouched.
      await context.database.client.db.execute(sql`
        update orders set cancelled_reason = 'Hết thời hạn giữ hàng.' where id = ${order.orderId}
      `);
      const row = await rowOf(order.orderId);
      expect(row.cancelled_reason).not.toContain('expired');
      expect((await reservationOf(context, order.orderId)).status).toBe('EXPIRED');

      expect(dataOf<OrderPayload>(await readOrder(token)).terminationReason).toBe(
        'RESERVATION_EXPIRED',
      );
    });
  });

  /** §13 — the access boundary is untouched by this correction. */
  describe('ORDER_ACCESS isolation is unchanged', () => {
    it('never classifies one order from another order’s token', async () => {
      const expired = await createReadyMadeOrder(context, {
        label: 'isoexp',
        unitPrice: 60_000,
        quantity: 1,
      });
      const live = await createReadyMadeOrder(context, {
        label: 'isolive',
        unitPrice: 61_000,
        quantity: 1,
      });
      const expiredToken = (await adoptOrderAccessToken(context, expired.orderId)).token;
      const liveToken = (await adoptOrderAccessToken(context, live.orderId)).token;

      await makeDue(expired.orderId);
      expect((await sweep.runPass()).expired).toBeGreaterThanOrEqual(1);

      // Each token opens exactly its own order, and the expiry of one is not
      // visible through the other.
      expect(dataOf<OrderPayload>(await readOrder(expiredToken)).terminationReason).toBe(
        'RESERVATION_EXPIRED',
      );
      const other = dataOf<OrderPayload>(await readOrder(liveToken));
      expect(other.status).toBe('AWAITING_SHIPPING_FEE');
      expect(other.terminationReason).toBeUndefined();
    });
  });
});
