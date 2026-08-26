/**
 * `APP9-B01` §14 — `TR-LC14-05`, against a real PostgreSQL instance and through
 * the real HTTP route.
 *
 * Every case is stated as the property it protects. The point of this checkpoint
 * is that opening final payment is a **guarded lifecycle move and nothing else**,
 * so the assertions are about committed rows — `orders.status`,
 * `order_transitions`, `payment_obligations`, `payment_attempts`,
 * `outbox_events`, `audit_events` — and not about the response body alone. A
 * response can be right while the database is half-written, or while a command
 * has quietly created an obligation it was only meant to read; a row count
 * cannot.
 */
import request from 'supertest';

import {
  createFinalPaymentContext,
  dataOf,
  errorCodeOf,
  REMAINING_AMOUNT,
  TRANSITION_ROUTE,
  type FinalPaymentTestContext,
} from './final-payment-context';

interface TransitionPayload {
  readonly orderId: string;
  readonly code: string;
  readonly fromStatus: string;
  readonly status: string;
  readonly remainingObligationId: string;
  readonly remainingObligationStatus: string;
}

describe('APP9-B01 — final-payment lifecycle entry (integration)', () => {
  let context: FinalPaymentTestContext;

  beforeAll(async () => {
    context = await createFinalPaymentContext('app9-b01-final-payment');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const open = (
    orderId: string,
    body: Record<string, unknown> = { to: 'AWAITING_FINAL_PAYMENT' },
  ) =>
    request(context.server())
      .post(TRANSITION_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(body);

  // -------------------------------------------------------------------------
  // Case 1 — the whole effect, committed once, and nothing beyond it.
  // -------------------------------------------------------------------------

  describe('case 1 — a PRODUCTION_COMPLETED order with a live REMAINING obligation', () => {
    it('moves the order to AWAITING_FINAL_PAYMENT and leaves the obligation exactly as it was', async () => {
      const order = await context.seedOrder();
      const before = {
        outbox: await context.countRows('outbox_events'),
        audit: await context.countRows('audit_events'),
        attempts: await context.countRows('payment_attempts'),
      };

      const result = dataOf<TransitionPayload>(await open(order.orderId).expect(200));

      expect(result.orderId).toBe(order.orderId);
      expect(result.code).toBe(order.code);
      expect(result.fromStatus).toBe('PRODUCTION_COMPLETED');
      expect(result.status).toBe('AWAITING_FINAL_PAYMENT');
      expect(result.remainingObligationStatus).toBe('PENDING');

      await expect(context.orderStatus(order.orderId)).resolves.toBe('AWAITING_FINAL_PAYMENT');

      // The canonical transition evidence: one appended row, the ADMIN actor the
      // guard bound, and the LC-14 `STATE_CHANGE` kind. The seed's three SYSTEM
      // hops precede it.
      const transitions = await context.transitionsOf(order.orderId);
      expect(transitions).toHaveLength(4);
      const appended = transitions.at(-1);
      expect(appended?.fromStatus).toBe('PRODUCTION_COMPLETED');
      expect(appended?.toStatus).toBe('AWAITING_FINAL_PAYMENT');
      expect(appended?.eventKind).toBe('STATE_CHANGE');
      expect(appended?.actorKind).toBe('ADMIN');
      // The operator the guard bound, persisted — not a caller-supplied value.
      expect(typeof appended?.adminId).toBe('string');

      // The obligation the command required is the one it reported, and the
      // command touched none of it: same amount, same currency, still PENDING,
      // still unsatisfied. No third obligation was created and no attempt was
      // opened — B01 opens the window, it does not collect.
      const obligations = await context.obligationsOf(order.orderId);
      expect(obligations.map((one) => one.kind)).toEqual(['DEPOSIT', 'REMAINING']);
      const remaining = obligations[1];
      expect(remaining?.id).toBe(result.remainingObligationId);
      expect(remaining?.amount).toBe(REMAINING_AMOUNT);
      expect(remaining?.currencyCode).toBe('VND');
      expect(remaining?.status).toBe('PENDING');
      expect(remaining?.satisfiedAt).toBeNull();
      await expect(context.countRows('payment_attempts')).resolves.toBe(before.attempts);

      // No side effect beyond the transition row: no outbox event and no audit
      // row, because no accepted one is invented here and customer
      // communication is APP10's (`APP9-G01` §8).
      await expect(context.countRows('outbox_events')).resolves.toBe(before.outbox);
      await expect(context.countRows('audit_events')).resolves.toBe(before.audit);
    });
  });

  // -------------------------------------------------------------------------
  // Case 2 — the REMAINING guard, refused without repair.
  // -------------------------------------------------------------------------

  describe('case 2 — no live REMAINING obligation', () => {
    it('refuses an order whose only obligation is the DEPOSIT, and creates nothing', async () => {
      const order = await context.seedOrder({ remaining: false });

      const response = await open(order.orderId).expect(409);
      expect(errorCodeOf(response)).toBe('ORDER_REMAINING_PAYMENT_MISSING');

      // Unchanged, and un-repaired: the DEPOSIT cannot stand in for the
      // REMAINING obligation, and the missing row is escalated rather than
      // fabricated on the way past.
      await expect(context.orderStatus(order.orderId)).resolves.toBe('PRODUCTION_COMPLETED');
      const obligations = await context.obligationsOf(order.orderId);
      expect(obligations.map((one) => one.kind)).toEqual(['DEPOSIT']);
      expect(await context.transitionsOf(order.orderId)).toHaveLength(3);
    });

    it('refuses an order whose REMAINING obligation is SUPERSEDED', async () => {
      const order = await context.seedOrder();
      const remaining = (await context.obligationsOf(order.orderId)).find(
        (one) => one.kind === 'REMAINING',
      );
      await context.supersede(remaining?.id ?? '');

      const response = await open(order.orderId).expect(409);
      expect(errorCodeOf(response)).toBe('ORDER_REMAINING_PAYMENT_MISSING');

      await expect(context.orderStatus(order.orderId)).resolves.toBe('PRODUCTION_COMPLETED');
      expect(await context.transitionsOf(order.orderId)).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // Case 3 — the source-state guard, which is not LC-14 legality.
  // -------------------------------------------------------------------------

  describe('case 3 — a source state other than PRODUCTION_COMPLETED', () => {
    it('refuses an order still IN_PRODUCTION', async () => {
      const order = await context.seedOrder({ status: 'IN_PRODUCTION' });

      const response = await open(order.orderId).expect(409);
      expect(errorCodeOf(response)).toBe('ORDER_INVALID_TRANSITION');

      await expect(context.orderStatus(order.orderId)).resolves.toBe('IN_PRODUCTION');
      expect(await context.transitionsOf(order.orderId)).toHaveLength(2);
    });

    it('refuses an ON_HOLD order, whose move to AWAITING_FINAL_PAYMENT is LC-14 legal', async () => {
      // The case that proves the guard is the *source state*, not legality:
      // `ON_HOLD → AWAITING_FINAL_PAYMENT` is in the LC-14 `ALLOWED` set — it is
      // the resume path — so a legality check alone would let a held order open
      // final payment.
      const order = await context.seedOrder({ status: 'ON_HOLD' });

      const response = await open(order.orderId).expect(409);
      expect(errorCodeOf(response)).toBe('ORDER_INVALID_TRANSITION');

      await expect(context.orderStatus(order.orderId)).resolves.toBe('ON_HOLD');
      expect(await context.transitionsOf(order.orderId)).toHaveLength(4);
    });
  });

  // -------------------------------------------------------------------------
  // Case 4 — replay.
  // -------------------------------------------------------------------------

  describe('case 4 — the same command sent twice', () => {
    it('refuses the second deterministically and appends no second transition', async () => {
      const order = await context.seedOrder();

      await open(order.orderId).expect(200);
      const outbox = await context.countRows('outbox_events');
      const audit = await context.countRows('audit_events');

      const replay = await open(order.orderId).expect(409);
      expect(errorCodeOf(replay)).toBe('ORDER_INVALID_TRANSITION');

      // Exactly one effective transition, and no duplicate side effect. The
      // repository's own semantics are what produce this: `TR-LC14-05` is legal
      // from one state, so a retry after the move cannot repeat it.
      await expect(context.orderStatus(order.orderId)).resolves.toBe('AWAITING_FINAL_PAYMENT');
      const transitions = await context.transitionsOf(order.orderId);
      expect(transitions.filter((one) => one.toStatus === 'AWAITING_FINAL_PAYMENT')).toHaveLength(
        1,
      );
      await expect(context.countRows('outbox_events')).resolves.toBe(outbox);
      await expect(context.countRows('audit_events')).resolves.toBe(audit);
    });
  });

  // -------------------------------------------------------------------------
  // Case 5 — the actor boundary on a route that did not exist before.
  // -------------------------------------------------------------------------

  describe('case 5 — an unauthenticated caller', () => {
    it('is refused before the order is read, and nothing moves', async () => {
      const order = await context.seedOrder();

      await request(context.server())
        .post(TRANSITION_ROUTE(order.orderId))
        .send({ to: 'AWAITING_FINAL_PAYMENT' })
        .expect(401);

      await expect(context.orderStatus(order.orderId)).resolves.toBe('PRODUCTION_COMPLETED');
      expect(await context.transitionsOf(order.orderId)).toHaveLength(3);
    });
  });
});
