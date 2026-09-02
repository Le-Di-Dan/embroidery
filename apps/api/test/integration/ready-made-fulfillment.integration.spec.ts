/**
 * `APP12-B05` — Ready-Made fulfilment through the delivered APP9 Admin
 * operations, against a real database.
 *
 * `adminOrder_dispatch` and `adminOrder_complete` are reused verbatim: there is
 * no Ready-Made dispatch route, no Ready-Made completion route and no
 * origin-specific lifecycle. What the checkpoint changed is that both are now
 * *reachable* for a Ready-Made order — the delivered path mapped every order
 * onto the custom aggregate and refused one whose quotation chain is null — and
 * that `GRD-016` asks for the obligation the order's own origin settles on.
 *
 * Every state below is reached by a production route. `READY_FOR_DELIVERY` in
 * particular comes from a real `adminPaymentAttempt_verify`, never from SQL:
 * a fabricated one would let a dispatch pass a guard that a paid order has to
 * pass for real.
 */
import request from 'supertest';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import {
  createReadyMadeOrder,
  dataOf,
  errorCodeOf,
  obligationsOf,
  orderOf,
  reservationOf,
  seedAdminSession,
  serverOf,
  SHIPPING_ROUTE,
  shippingBody,
} from '../support/ready-made-shipping-fixture';
import {
  adoptOrderAccessToken,
  FULL_PAYMENT_ATTEMPTS_ROUTE,
  ORDER_READ_ROUTE,
  seedStepUp,
} from '../support/ready-made-access-fixture';
import {
  completeOrder,
  customArtifactCounts,
  dispatchOrder,
  ledgerOf,
  reservationsOf,
  shippingDetailOf,
  stockOf,
  verifyAttempt,
} from '../support/ready-made-fulfillment-fixture';

interface OpenedAttempt {
  readonly attemptId: string;
  readonly amount: string;
  readonly transferReference: string;
}

interface DispatchPayload {
  readonly fromStatus: string;
  readonly status: string;
  readonly shippingStatus: string;
  readonly frozenAt: string;
}

interface CompletionPayload {
  readonly fromStatus: string;
  readonly status: string;
}

describe('APP12-B05 — Ready-Made fulfilment reuses the APP9 Admin operations', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b05_fulfil');
    await publishSecureAccessPolicies(context.app, context.database);
    cookie = await seedAdminSession(context);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  const setFee = (orderId: string, feeAmount: string) =>
    request(serverOf(context))
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount }));

  /** A Ready-Made order carried by real routes to `AWAITING_PAYMENT`. */
  async function payableOrder(label: string) {
    const order = await createReadyMadeOrder(context, {
      label,
      unitPrice: 250_000,
      quantity: 1,
      quantityOnHand: 10,
    });
    const { token } = await adoptOrderAccessToken(context, order.orderId);
    await setFee(order.orderId, '30000').expect(200);
    await seedStepUp(context, order.fixture.customerId);
    const opened = dataOf<OpenedAttempt>(
      await request(serverOf(context))
        .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
        .set('Idempotency-Key', `b05-fulfil-${label}`)
        .send({ token })
        .expect(201),
    );
    return { ...order, token, attempt: opened };
  }

  /** …and on to `READY_FOR_DELIVERY` through the real verification. */
  async function paidOrder(label: string) {
    const order = await payableOrder(label);
    await verifyAttempt(context, cookie, order.attempt.attemptId, {
      observedAmount: order.attempt.amount,
      observedTransferReference: order.attempt.transferReference,
    }).expect(200);
    return order;
  }

  describe('dispatch', () => {
    it('moves READY_FOR_DELIVERY to DELIVERED and freezes the shipping detail', async () => {
      const order = await paidOrder('dispatch');
      expect((await shippingDetailOf(context, order.orderId)).status).toBe('EDITABLE');

      const result = dataOf<DispatchPayload>(
        await dispatchOrder(context, cookie, order.orderId).expect(200),
      );
      expect(result.fromStatus).toBe('READY_FOR_DELIVERY');
      expect(result.status).toBe('DELIVERED');
      expect(result.shippingStatus).toBe('FROZEN');
      expect(result.frozenAt).toEqual(expect.any(String));

      // §25 — the delivered APP9 freeze, not a Ready-Made flag beside it.
      const detail = await shippingDetailOf(context, order.orderId);
      expect(detail.status).toBe('FROZEN');
      expect(detail.frozen_at).not.toBeNull();
      // …and an ordinary shipping edit is refused from here on.
      await setFee(order.orderId, '45000').expect(409);
    });

    it('requires no production job, quotation or deposit', async () => {
      const order = await paidOrder('noartifacts');
      await dispatchOrder(context, cookie, order.orderId).expect(200);

      expect(await customArtifactCounts(context, order.orderId)).toEqual({
        productionJobs: 0,
        depositObligations: 0,
        remainingObligations: 0,
      });
    });

    it('reserves nothing and consumes nothing a second time', async () => {
      const order = await paidOrder('nostock');
      const before = await stockOf(context, order.fixture.skuId);
      await dispatchOrder(context, cookie, order.orderId).expect(200);
      await completeOrder(context, cookie, order.orderId).expect(200);

      // §27, §29 — the whole tail of the lifecycle touches no inventory.
      expect(await stockOf(context, order.fixture.skuId)).toEqual(before);
      expect(await reservationsOf(context, order.orderId)).toHaveLength(1);
      expect(
        (await ledgerOf(context, order.orderId)).filter((row) => row.entry_kind === 'CONSUMED'),
      ).toHaveLength(1);
    });

    it('refuses an order still awaiting payment', async () => {
      const order = await payableOrder('unpaid');
      const refusal = await dispatchOrder(context, cookie, order.orderId).expect(409);
      expect(errorCodeOf(refusal)).toBe('ORDER_INVALID_TRANSITION');

      expect((await orderOf(context, order.orderId)).status).toBe('AWAITING_PAYMENT');
      expect((await shippingDetailOf(context, order.orderId)).status).toBe('EDITABLE');
      expect((await reservationOf(context, order.orderId)).status).toBe('RESERVED');
    });

    it('refuses a second dispatch deterministically', async () => {
      const order = await paidOrder('twice');
      await dispatchOrder(context, cookie, order.orderId).expect(200);

      const refusal = await dispatchOrder(context, cookie, order.orderId).expect(409);
      expect(errorCodeOf(refusal)).toBe('ORDER_INVALID_TRANSITION');
      expect((await orderOf(context, order.orderId)).status).toBe('DELIVERED');
    });
  });

  describe('completion', () => {
    it('refuses completion straight from READY_FOR_DELIVERY', async () => {
      const order = await paidOrder('early');
      // §23 — the locked lifecycle requires DELIVERED first, and `COMPLETED` has
      // no successor, so an early completion could not be undone.
      const refusal = await completeOrder(context, cookie, order.orderId).expect(409);
      expect(errorCodeOf(refusal)).toBe('ORDER_INVALID_TRANSITION');
      expect((await orderOf(context, order.orderId)).status).toBe('READY_FOR_DELIVERY');
    });

    it('moves DELIVERED to COMPLETED and refuses a repeat', async () => {
      const order = await paidOrder('complete');
      await dispatchOrder(context, cookie, order.orderId).expect(200);

      const result = dataOf<CompletionPayload>(
        await completeOrder(context, cookie, order.orderId).expect(200),
      );
      expect(result.fromStatus).toBe('DELIVERED');
      expect(result.status).toBe('COMPLETED');

      const refusal = await completeOrder(context, cookie, order.orderId).expect(409);
      expect(errorCodeOf(refusal)).toBe('ORDER_INVALID_TRANSITION');
      expect((await orderOf(context, order.orderId)).status).toBe('COMPLETED');
    });
  });

  describe('the customer projection follows the order to the end', () => {
    it('reports DELIVERED and then COMPLETED on the delivered ORDER_ACCESS grant', async () => {
      const order = await paidOrder('projection');

      await dispatchOrder(context, cookie, order.orderId).expect(200);
      const delivered = dataOf<{ status: string; terminationReason?: string }>(
        await request(serverOf(context))
          .post(ORDER_READ_ROUTE)
          .send({ token: order.token })
          .expect(200),
      );
      expect(delivered.status).toBe('DELIVERED');
      expect(delivered.terminationReason).toBeUndefined();

      await completeOrder(context, cookie, order.orderId).expect(200);
      const completed = dataOf<{ status: string; terminationReason?: string }>(
        await request(serverOf(context))
          .post(ORDER_READ_ROUTE)
          .send({ token: order.token })
          .expect(200),
      );
      expect(completed.status).toBe('COMPLETED');
      expect(completed.terminationReason).toBeUndefined();

      // The payment record stays truthful for the whole life of the order.
      const obligations = await obligationsOf(context, order.orderId);
      expect(obligations).toHaveLength(1);
      expect(obligations[0]).toMatchObject({ kind: 'FULL', status: 'SATISFIED' });
    });
  });
});
