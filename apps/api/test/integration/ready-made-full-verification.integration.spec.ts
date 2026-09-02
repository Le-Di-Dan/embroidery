/**
 * `APP12-B05` — Admin `FULL` verification, against a real database.
 *
 * Every order below is created by the production `publicReadyMadeOrder_create`,
 * priced by `adminOrderShipping_save`, paid by `publicOrderFullPayment_initiate`
 * and settled by `adminPaymentAttempt_verify`. Nothing fabricates an obligation,
 * an attempt, a `SATISFIED` status or a `CONSUMED` reservation: the point of the
 * checkpoint is that those states are now reachable through the delivered
 * operations, so producing one from SQL would prove nothing.
 *
 * The money is `APP12-B04` §39's example throughout: `250000 + 30000 = 280000`.
 */
import request from 'supertest';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import {
  countForOrder,
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
  FULL_PAYMENT_QR_ROUTE,
  FULL_PAYMENT_ROUTE,
  ORDER_READ_ROUTE,
  seedStepUp,
  syntheticAccessToken,
} from '../support/ready-made-access-fixture';
import {
  customArtifactCounts,
  ledgerOf,
  reservationsOf,
  stockOf,
  verifyAttempt,
} from '../support/ready-made-fulfillment-fixture';

interface DecisionPayload {
  readonly attemptId: string;
  readonly attemptStatus: string;
  readonly depositStatus: string;
  readonly orderStatus: string;
  readonly reconciliationAction: string;
  readonly replayed: boolean;
}

interface OpenedAttempt {
  readonly attemptId: string;
  readonly amount: string;
  readonly transferReference: string;
}

const MERCHANDISE = 250_000;
const FEE = '30000';
const PAYABLE = '280000.00';

describe('APP12-B05 — Admin FULL verification', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b05_verify');
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

  /**
   * One order carried by the real routes as far as "an eligible attempt exists".
   *
   * The transfer memo is read back from the attempt the server minted rather
   * than rebuilt here: an operator verifying types what the customer was shown,
   * and a suite that derived the memo independently would be testing its own
   * copy of the rule instead of the one the customer received.
   */
  async function payableAttempt(label: string, options: { fee?: string; onHand?: number } = {}) {
    const order = await createReadyMadeOrder(context, {
      label,
      unitPrice: MERCHANDISE,
      quantity: 1,
      quantityOnHand: options.onHand ?? 10,
    });
    const { token } = await adoptOrderAccessToken(context, order.orderId);
    await setFee(order.orderId, options.fee ?? FEE).expect(200);
    await seedStepUp(context, order.fixture.customerId);

    const opened = await request(serverOf(context))
      .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
      .set('Idempotency-Key', `b05-${label}`)
      .send({ token })
      .expect(201);
    return { ...order, token, attempt: dataOf<OpenedAttempt>(opened) };
  }

  describe('the canonical settlement', () => {
    it('satisfies FULL, consumes the reservation and reaches READY_FOR_DELIVERY', async () => {
      const order = await payableAttempt('happy');
      // The hold is standing: on-hand still counts the units, availability does
      // not.
      expect(await stockOf(context, order.fixture.skuId)).toEqual({
        onHand: 10,
        reserved: 1,
        available: 9,
      });

      const decision = dataOf<DecisionPayload>(
        await verifyAttempt(context, cookie, order.attempt.attemptId, {
          observedAmount: order.attempt.amount,
          observedTransferReference: order.attempt.transferReference,
        }).expect(200),
      );

      expect(order.attempt.amount).toBe(PAYABLE);
      expect(decision.attemptStatus).toBe('SUCCEEDED');
      expect(decision.depositStatus).toBe('SATISFIED');
      expect(decision.orderStatus).toBe('READY_FOR_DELIVERY');
      expect(decision.replayed).toBe(false);

      const obligations = await obligationsOf(context, order.orderId);
      expect(obligations).toHaveLength(1);
      expect(obligations[0]).toMatchObject({ kind: 'FULL', status: 'SATISFIED' });
      expect((await orderOf(context, order.orderId)).status).toBe('READY_FOR_DELIVERY');
    });

    it('commits the stock permanently without handing the units back', async () => {
      const order = await payableAttempt('inventory');
      await verifyAttempt(context, cookie, order.attempt.attemptId, {
        observedAmount: order.attempt.amount,
        observedTransferReference: order.attempt.transferReference,
      }).expect(200);

      // §28. On-hand falls by the quantity sold; availability is unchanged,
      // because those units were already spoken for. A reservation made terminal
      // *without* the on-hand write would read 10 / 0 / 10 here — the unit back
      // on the shelf, ready to be sold a second time.
      expect(await stockOf(context, order.fixture.skuId)).toEqual({
        onHand: 9,
        reserved: 0,
        available: 9,
      });

      const reservations = await reservationsOf(context, order.orderId);
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.status).toBe('CONSUMED');

      const ledger = await ledgerOf(context, order.orderId);
      const consumed = ledger.filter((entry) => entry.entry_kind === 'CONSUMED');
      expect(consumed).toHaveLength(1);
      expect(consumed[0]).toMatchObject({ quantity: 1, on_hand_delta: -1 });
      expect(ledger.some((entry) => entry.entry_kind === 'RESERVATION_EXPIRED')).toBe(false);
    });

    it('creates no custom artifact and no second reservation', async () => {
      const order = await payableAttempt('artifacts');
      await verifyAttempt(context, cookie, order.attempt.attemptId, {
        observedAmount: order.attempt.amount,
        observedTransferReference: order.attempt.transferReference,
      }).expect(200);

      expect(await customArtifactCounts(context, order.orderId)).toEqual({
        productionJobs: 0,
        depositObligations: 0,
        remainingObligations: 0,
      });
      expect(await reservationsOf(context, order.orderId)).toHaveLength(1);
      // One reconciliation for one verification, one attempt for one payment.
      expect(await countForOrder(context, 'payment_reconciliations', order.orderId)).toBe(1);
      expect(await countForOrder(context, 'payment_attempts', order.orderId)).toBe(1);
    });

    it('leaves the customer projection usable and no longer payable', async () => {
      const order = await payableAttempt('projection');
      await verifyAttempt(context, cookie, order.attempt.attemptId, {
        observedAmount: order.attempt.amount,
        observedTransferReference: order.attempt.transferReference,
      }).expect(200);

      // §18 — ORDER_ACCESS is not revoked by payment. The customer still has to
      // be able to watch their order ship.
      const read = dataOf<{ status: string; terminationReason?: string }>(
        await request(serverOf(context))
          .post(ORDER_READ_ROUTE)
          .send({ token: order.token })
          .expect(200),
      );
      expect(read.status).toBe('READY_FOR_DELIVERY');
      // §46 — the reservation was consumed, not expired. Misclassifying it would
      // tell a paying customer their order lapsed.
      expect(read.terminationReason).toBeUndefined();

      const payment = dataOf<{ fullPaymentStatus: string; payable: boolean }>(
        await request(serverOf(context))
          .post(FULL_PAYMENT_ROUTE)
          .send({ token: order.token })
          .expect(200),
      );
      expect(payment.fullPaymentStatus).toBe('SATISFIED');
      expect(payment.payable).toBe(false);

      // §33 — the two *acting* operations refuse: there is nothing left to pay.
      await seedStepUp(context, order.fixture.customerId);
      await request(serverOf(context))
        .post(FULL_PAYMENT_QR_ROUTE)
        .send({ token: order.token })
        .expect(409);
      await request(serverOf(context))
        .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
        .set('Idempotency-Key', `b05-after-${order.orderId}`)
        .send({ token: order.token })
        .expect(409);
    });

    it('refuses a shipping-fee correction afterwards, with no successor FULL', async () => {
      const order = await payableAttempt('feefreeze');
      await verifyAttempt(context, cookie, order.attempt.attemptId, {
        observedAmount: order.attempt.amount,
        observedTransferReference: order.attempt.transferReference,
      }).expect(200);

      // §20 / §47 — B03 already locked this, and a satisfied FULL must not
      // become editable because B05 moved the order past it.
      await setFee(order.orderId, '45000').expect(409);
      const obligations = await obligationsOf(context, order.orderId);
      expect(obligations).toHaveLength(1);
      expect(obligations[0]?.status).toBe('SATISFIED');
      expect((await orderOf(context, order.orderId)).status).toBe('READY_FOR_DELIVERY');
      expect((await reservationOf(context, order.orderId)).status).toBe('CONSUMED');
    });
  });

  describe('repeated verification', () => {
    it('replays the committed truth and consumes nothing a second time', async () => {
      const order = await payableAttempt('replay');
      const body = {
        observedAmount: order.attempt.amount,
        observedTransferReference: order.attempt.transferReference,
      };
      await verifyAttempt(context, cookie, order.attempt.attemptId, body).expect(200);
      const after = await stockOf(context, order.fixture.skuId);

      const replay = dataOf<DecisionPayload>(
        await verifyAttempt(context, cookie, order.attempt.attemptId, body).expect(200),
      );
      // §15, §44 — the delivered replay semantics, unchanged: the same committed
      // answer, and `replayed` says so rather than a conflict that would read as
      // "the payment failed" for a payment that succeeded.
      expect(replay.replayed).toBe(true);
      expect(replay.attemptStatus).toBe('SUCCEEDED');
      expect(replay.depositStatus).toBe('SATISFIED');
      expect(replay.orderStatus).toBe('READY_FOR_DELIVERY');

      expect(await stockOf(context, order.fixture.skuId)).toEqual(after);
      expect(
        (await ledgerOf(context, order.orderId)).filter((row) => row.entry_kind === 'CONSUMED'),
      ).toHaveLength(1);
      expect(await reservationsOf(context, order.orderId)).toHaveLength(1);
      expect(await countForOrder(context, 'payment_reconciliations', order.orderId)).toBe(1);
    });
  });

  describe('refusals', () => {
    it('refuses an attempt whose FULL a fee correction superseded', async () => {
      const order = await payableAttempt('superseded');
      // §42 — the correction supersedes the obligation this attempt belongs to.
      await setFee(order.orderId, '45000').expect(200);

      const refusal = await verifyAttempt(context, cookie, order.attempt.attemptId, {
        observedAmount: order.attempt.amount,
        observedTransferReference: order.attempt.transferReference,
      }).expect(409);
      expect(errorCodeOf(refusal)).toBe('PAYMENT_OBLIGATION_NOT_PAYABLE');

      const obligations = await obligationsOf(context, order.orderId);
      expect(obligations.map((row) => row.status)).toEqual(['SUPERSEDED', 'PENDING']);
      expect((await orderOf(context, order.orderId)).status).toBe('AWAITING_PAYMENT');
      expect((await reservationOf(context, order.orderId)).status).toBe('RESERVED');
      expect(await stockOf(context, order.fixture.skuId)).toEqual({
        onHand: 10,
        reserved: 1,
        available: 9,
      });

      // …and the successor verifies normally, which is what proves the refusal
      // was about *which* obligation rather than about Ready-Made verification.
      await seedStepUp(context, order.fixture.customerId);
      const opened = dataOf<OpenedAttempt>(
        await request(serverOf(context))
          .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
          .set('Idempotency-Key', `b05-successor-${order.orderId}`)
          .send({ token: order.token })
          .expect(201),
      );
      expect(opened.amount).toBe('295000.00');
      // The memo is unchanged across the supersession: it names the order.
      expect(opened.transferReference).toBe(order.attempt.transferReference);

      const decision = dataOf<DecisionPayload>(
        await verifyAttempt(context, cookie, opened.attemptId, {
          observedAmount: opened.amount,
          observedTransferReference: opened.transferReference,
        }).expect(200),
      );
      expect(decision.depositStatus).toBe('SATISFIED');
      expect(decision.orderStatus).toBe('READY_FOR_DELIVERY');
      expect((await reservationOf(context, order.orderId)).status).toBe('CONSUMED');
    });

    it('routes a wrong observed amount to review, moving and consuming nothing', async () => {
      const order = await payableAttempt('mismatch');
      const decision = dataOf<DecisionPayload>(
        await verifyAttempt(context, cookie, order.attempt.attemptId, {
          observedAmount: '279000',
          observedTransferReference: order.attempt.transferReference,
        }).expect(200),
      );

      // The delivered mismatch lane, unchanged — and it must not have committed
      // stock on its way to `REQUIRES_REVIEW`.
      expect(decision.attemptStatus).toBe('REQUIRES_REVIEW');
      expect((await orderOf(context, order.orderId)).status).toBe('AWAITING_PAYMENT');
      expect((await reservationOf(context, order.orderId)).status).toBe('RESERVED');
      expect(
        (await ledgerOf(context, order.orderId)).filter((row) => row.entry_kind === 'CONSUMED'),
      ).toHaveLength(0);
      expect(await stockOf(context, order.fixture.skuId)).toEqual({
        onHand: 10,
        reserved: 1,
        available: 9,
      });
    });

    it('leaves the customer access chain exactly as B04 delivered it', async () => {
      // Asserted here so a B05 regression that widened the Admin path cannot go
      // unnoticed on the customer side of the same surface.
      await request(serverOf(context))
        .post(FULL_PAYMENT_ROUTE)
        .send({ token: syntheticAccessToken() })
        .expect(404);
    });
  });
});
