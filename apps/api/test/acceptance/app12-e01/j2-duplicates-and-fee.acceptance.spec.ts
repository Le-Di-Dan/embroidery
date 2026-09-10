/**
 * `APP12-E01` journey **J2** — the duplication and fee-correction matrix
 * (§9, §10, §11, §12), on one composed application.
 *
 * ### What each section adds over the suite that owns the mechanism
 *
 * `APP12-B02`'s concurrency suite proves the creation arbiter; `APP12-B03`'s
 * proves two concurrent fee writes serialise; `APP12-B05`'s proves repeated
 * verification replays. None of those is re-run. What §9–§12 ask is narrower and
 * harder to see from inside one checkpoint: after a *replay* the order must be
 * indistinguishable from one that was submitted once — not merely "one order",
 * but one order with one of everything downstream, and a second `FULL`
 * initiation after the first must leave exactly one live obligation a customer
 * could be looking at.
 *
 * ### The money guards U01 added (§12, §22)
 *
 * Two of them are business-truth regressions rather than lifecycle ones:
 *
 * - the frozen goods subtotal does not move when the fee is corrected — it is
 *   recomposed from the frozen lines, so two corrections cannot compound;
 * - the payment window is reset **once**, by the first confirmation, and a later
 *   correction does not keep pushing it out. A fee an operator fixed three times
 *   must not buy the customer three fresh days.
 *
 * Both are asserted against the stored rows, not against a response field that
 * could agree with a wrong row.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  countForOrder,
  obligationsOf,
  orderOf,
  reservationOf,
  shippingBody,
  SHIPPING_ROUTE,
} from '../../support/ready-made-shipping-fixture';
import { createBody, seedReadyMadeContext } from '../../support/ready-made-order-fixture';
import { FULL_PAYMENT_ATTEMPTS_ROUTE, seedStepUp } from '../../support/ready-made-access-fixture';
import { reservationsOf, stockOf } from '../../support/ready-made-fulfillment-fixture';
import {
  confirmFee,
  dataOf,
  openE01Context,
  openFullAttempt,
  placeOrder,
  serverOf,
  transitionsOf,
  verifyExactly,
  type E01Context,
  type E01Order,
} from './app12-e01-context';

const CREATE_ROUTE = '/api/public/ready-made-orders';

const UNIT_PRICE = 180_000;
const QUANTITY = 1;
/** `180000 × 1`, frozen at creation. Every fee below is measured against it. */
const MERCHANDISE = '180000.00';
const FIRST_FEE = '25000';
const CORRECTED_FEE = '40000';
const PAYABLE_FIRST = '205000.00';
const PAYABLE_CORRECTED = '220000.00';

interface FeeOutcome {
  readonly changed: boolean;
  readonly previousFeeAmount: string | null;
  readonly supersededObligationId: string | null;
  readonly fullObligationId: string | null;
  readonly payableTotalAmount: string | null;
}

interface SavedShipping {
  readonly fee: FeeOutcome;
}

describe('APP12-E01 · J2 duplicate submission, duplicate payment, fee correction', () => {
  let context: E01Context;

  beforeAll(async () => {
    context = await openE01Context('app12_e01_j2');
  }, 600_000);

  afterAll(async () => {
    await context?.close();
  });

  describe('§9 a replayed checkout settles to one order', () => {
    let statuses: readonly number[];
    let customerId: string;
    let skuId: string;

    beforeAll(async () => {
      const fixture = await seedReadyMadeContext(context.api.database, {
        label: 'e01-j2-replay',
        basePriceAmount: UNIT_PRICE,
        quantityOnHand: 5,
      });
      customerId = fixture.customerId;
      skuId = fixture.skuId;
      const body = createBody(fixture, { quantity: QUANTITY });
      const key = `e01-j2-replay-${fixture.customerId}`;
      const send = (): request.Test =>
        request(serverOf(context.api)).post(CREATE_ROUTE).set('Idempotency-Key', key).send(body);

      // Concurrent, then replayed after both settled. Production sees both
      // shapes — a double-clicked button and a retried request — and they must
      // reach the same single order.
      const raced = await Promise.all([send(), send()]);
      const replayed = await send();
      statuses = [...raced.map((response) => response.status), replayed.status];
    }, 600_000);

    it('answers every caller canonically and never with a uniqueness error', () => {
      expect(statuses.filter((status) => status === 201).length).toBeGreaterThanOrEqual(1);
      expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
    });

    it('commits one order, one line set and one reservation', async () => {
      const state = await committedFor(customerId);
      expect(state).toEqual({ orders: 1, items: 1, reservations: 1, shipping: 1 });
    });

    it('reserves the quantity of a single submission, not of three', async () => {
      expect(await stockOf(context.api, skuId)).toEqual({
        onHand: 5,
        reserved: QUANTITY,
        available: 5 - QUANTITY,
      });
    });
  });

  describe('§10 a repeated FULL initiation leaves one live obligation', () => {
    let order: E01Order;
    let firstAttemptId: string;

    beforeAll(async () => {
      order = await placeOrder(context, {
        label: 'e01-j2-full',
        unitPrice: UNIT_PRICE,
        quantity: QUANTITY,
      });
      await confirmFee(context, order.orderId, FIRST_FEE).expect(200);
      const attempt = await openFullAttempt(context, order, `e01-j2-full-${order.orderId}`);
      firstAttemptId = attempt.attemptId;

      // A second initiation, concurrent, under a *different* key — the shape a
      // customer produces by opening the payment page in two tabs. The
      // idempotency key cannot be what saves this one.
      await seedStepUp(context.api, order.fixture.customerId);
      await Promise.all([
        request(serverOf(context.api))
          .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
          .set('Idempotency-Key', `e01-j2-full-b-${order.orderId}`)
          .send({ token: order.token }),
        request(serverOf(context.api))
          .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
          .set('Idempotency-Key', `e01-j2-full-c-${order.orderId}`)
          .send({ token: order.token }),
      ]);
    }, 600_000);

    it('keeps exactly one live FULL obligation at the exact payable total', async () => {
      const live = (await obligationsOf(context.api, order.orderId)).filter(
        (row) => row.status === 'PENDING',
      );
      expect(live).toHaveLength(1);
      expect(live[0]).toMatchObject({ kind: 'FULL', amount: PAYABLE_FIRST });
    });

    it('creates no second reservation and no second business effect', async () => {
      expect(await reservationsOf(context.api, order.orderId)).toHaveLength(1);
      expect((await reservationOf(context.api, order.orderId)).status).toBe('RESERVED');
      expect((await orderOf(context.api, order.orderId)).status).toBe('AWAITING_PAYMENT');
    });

    it('leaves the first attempt the one the operator will verify', async () => {
      // Whatever the repeated initiations did, they did not orphan the attempt
      // whose reference the customer already has.
      const { rows } = await context.api.database.client.db.execute<{
        id: string;
        status: string;
      }>(sql`
        select a.id, a.status from payment_attempts a
        join payment_obligations o on o.id = a.payment_obligation_id
        where o.order_id = ${order.orderId} order by a.created_at asc
      `);
      const pending = rows.filter((row) => row.status === 'PENDING');
      expect(pending.map((row) => row.id)).toContain(firstAttemptId);
    });
  });

  describe('§11 a repeated Admin verification settles once', () => {
    let order: E01Order;
    let second: request.Response;

    beforeAll(async () => {
      order = await placeOrder(context, {
        label: 'e01-j2-verify',
        unitPrice: UNIT_PRICE,
        quantity: QUANTITY,
        quantityOnHand: 4,
      });
      await confirmFee(context, order.orderId, FIRST_FEE).expect(200);
      const attempt = await openFullAttempt(context, order, `e01-j2-verify-${order.orderId}`);
      await verifyExactly(context, attempt).expect(200);
      second = await verifyExactly(context, attempt);
    }, 600_000);

    it('answers the second verification deterministically', () => {
      // Per the delivered contract this is a replay of committed truth, not a
      // second settlement. Either a replay or an explicit refusal is correct;
      // an ambiguous success that moved something again is not.
      expect([200, 409]).toContain(second.status);
    });

    it('consumed the reservation exactly once', async () => {
      expect((await reservationOf(context.api, order.orderId)).status).toBe('CONSUMED');
      expect(await reservationsOf(context.api, order.orderId)).toHaveLength(1);
    });

    it('decremented stock exactly once', async () => {
      expect(await stockOf(context.api, order.fixture.skuId)).toEqual({
        onHand: 4 - QUANTITY,
        reserved: 0,
        available: 4 - QUANTITY,
      });
    });

    it('recorded READY_FOR_DELIVERY once and no duplicate transition', async () => {
      const walked = await transitionsOf(context, order.orderId);
      expect(walked.filter((status) => status === 'READY_FOR_DELIVERY')).toHaveLength(1);
      expect(new Set(walked).size).toBe(walked.length);
    });

    it('settled one payment, not two', async () => {
      expect(await countForOrder(context.api, 'payment_attempts', order.orderId)).toBe(1);
      expect(await countForOrder(context.api, 'payment_reconciliations', order.orderId)).toBe(1);
    });
  });

  describe('§12 fee correction before and after satisfaction', () => {
    let order: E01Order;
    let firstReceipt: FeeOutcome;
    let correctionReceipt: FeeOutcome;
    let holdAfterFirst: string | null;
    let holdAfterCorrection: string | null;

    beforeAll(async () => {
      order = await placeOrder(context, {
        label: 'e01-j2-fee',
        unitPrice: UNIT_PRICE,
        quantity: QUANTITY,
      });

      firstReceipt = dataOf<SavedShipping>(
        await confirmFee(context, order.orderId, FIRST_FEE).expect(200),
      ).fee;
      holdAfterFirst = (await reservationOf(context.api, order.orderId)).expires_at;

      correctionReceipt = dataOf<SavedShipping>(
        await confirmFee(context, order.orderId, CORRECTED_FEE).expect(200),
      ).fee;
      holdAfterCorrection = (await reservationOf(context.api, order.orderId)).expires_at;
    }, 600_000);

    it('supersedes the old obligation rather than editing it', async () => {
      expect(correctionReceipt.changed).toBe(true);
      expect(correctionReceipt.supersededObligationId).toBe(firstReceipt.fullObligationId);
      const live = (await obligationsOf(context.api, order.orderId)).filter(
        (row) => row.status === 'PENDING',
      );
      expect(live).toHaveLength(1);
      expect(live[0]?.amount).toBe(PAYABLE_CORRECTED);
    });

    it('keeps the frozen goods subtotal exactly where it was (U01 F1)', async () => {
      // The new total is recomposed from the frozen lines, so it is the
      // subtotal plus the *new* fee — never the previous total adjusted.
      expect(correctionReceipt.payableTotalAmount).toBe(PAYABLE_CORRECTED);
      const { rows } = await context.api.database.client.db.execute<{ line: string }>(sql`
        select line_total_amount as line from order_items where order_id = ${order.orderId}
      `);
      expect(rows[0]?.line).toBe(MERCHANDISE);
      expect((await orderOf(context.api, order.orderId)).total_amount).toBe(PAYABLE_CORRECTED);
    });

    it('does not extend the payment window again', () => {
      // The first confirmation resets the hold to the canonical window, once.
      // A correction prices the same order; it does not buy more time.
      expect(holdAfterFirst).not.toBeNull();
      expect(holdAfterCorrection).toBe(holdAfterFirst);
    });

    it('records one entry into AWAITING_PAYMENT across both writes', async () => {
      const walked = await transitionsOf(context, order.orderId);
      expect(walked.filter((status) => status === 'AWAITING_PAYMENT')).toHaveLength(1);
    });

    it('refuses a fee edit once the FULL is satisfied', async () => {
      const attempt = await openFullAttempt(context, order, `e01-j2-fee-${order.orderId}`);
      await verifyExactly(context, attempt).expect(200);

      const refused = await request(serverOf(context.api))
        .put(SHIPPING_ROUTE(order.orderId))
        .set('Cookie', context.cookie)
        .send(shippingBody({ feeAmount: '99000' }));
      expect(refused.status).toBeGreaterThanOrEqual(400);

      // And the refusal changed nothing: money a customer has already paid is
      // not editable, and it did not become editable by being asked twice.
      expect((await orderOf(context.api, order.orderId)).total_amount).toBe(PAYABLE_CORRECTED);
      const settled = await obligationsOf(context.api, order.orderId);
      expect(settled.filter((row) => row.status === 'PENDING')).toHaveLength(0);
      expect(settled.filter((row) => row.status === 'SATISFIED').map((row) => row.amount)).toEqual([
        PAYABLE_CORRECTED,
      ]);
    });
  });

  /** Every downstream child of one customer's orders, counted together. */
  async function committedFor(customerId: string): Promise<{
    orders: number;
    items: number;
    reservations: number;
    shipping: number;
  }> {
    const { rows } = await context.api.database.client.db.execute<{
      orders: string;
      items: string;
      reservations: string;
      shipping: string;
    }>(sql`
      select (select count(*) from orders where customer_id = ${customerId}) as orders,
             (select count(*) from order_items i join orders o on o.id = i.order_id
               where o.customer_id = ${customerId}) as items,
             (select count(*) from inventory_reservations r join orders o on o.id = r.order_id
               where o.customer_id = ${customerId}) as reservations,
             (select count(*) from shipping_details d join orders o on o.id = d.order_id
               where o.customer_id = ${customerId}) as shipping
    `);
    return {
      orders: Number(rows[0]?.orders ?? '0'),
      items: Number(rows[0]?.items ?? '0'),
      reservations: Number(rows[0]?.reservations ?? '0'),
      shipping: Number(rows[0]?.shipping ?? '0'),
    };
  }
});
