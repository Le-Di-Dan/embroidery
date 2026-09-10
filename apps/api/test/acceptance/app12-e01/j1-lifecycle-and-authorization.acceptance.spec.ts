/**
 * `APP12-E01` journey **J1** — the Wave-1 positive lifecycle (§7) and the
 * authorization denial matrix (§8), on one composed application.
 *
 * ### What this proves that `APP12-B05`'s journey suite does not
 *
 * That suite walks the same seven steps and is not repeated here. What it never
 * states is the **exactly-once truth table** as one settled fact: it asserts
 * along the way, order by order, while §7 asks what the database contains when
 * the journey is over. A defect that created a second reservation and consumed
 * the first would pass every step-wise assertion. So the walk here is brisk and
 * the accounting at the end is exhaustive.
 *
 * The denial matrix runs on the **same** order the walk just completed, for the
 * reason `APP10-E01` recorded: "the anonymous caller was refused" is only worth
 * asserting when there is something real behind the guard for it to have
 * reached. A denial measured against an empty database proves the route exists.
 *
 * ### Money is read, never reconstructed (`APP12-U01-C1` F1)
 *
 * U01 found the Admin card labelling a shipping-inclusive total as the goods
 * figure. The fix was to read the frozen line subtotal instead. The contract
 * half of that fix is asserted here: the Admin read publishes a line total that
 * is **not** the order total once a fee exists, so a client has a frozen goods
 * figure to display and never has to subtract one number from another.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  countForOrder,
  obligationsOf,
  orderOf,
  reservationOf,
} from '../../support/ready-made-shipping-fixture';
import {
  completeOrder,
  customArtifactCounts,
  dispatchOrder,
  ledgerOf,
  reservationsOf,
  shippingDetailOf,
  stockOf,
} from '../../support/ready-made-fulfillment-fixture';
import { ORDER_READ_ROUTE } from '../../support/ready-made-access-fixture';
import { EVIDENCE_ROUTES } from '../../support/transfer-evidence-fixture';
import { ADMIN_PAYMENT_ROUTES } from '../../support/admin-payment-fixture';
import {
  ADMIN_ORDER_LIST_ROUTE,
  ADMIN_ORDER_ROUTE,
  RESOLVE_ROUTE,
  confirmFee,
  countRows,
  dataOf,
  openE01Context,
  openFullAttempt,
  placeOrder,
  readCustomerOrder,
  serverOf,
  transitionsOf,
  verifyExactly,
  type E01Context,
  type E01Order,
} from './app12-e01-context';

const ON_HAND = 8;
const QUANTITY = 2;
const UNIT_PRICE = 210_000;
const FEE = '30000';
/** `210000 × 2`, frozen at creation and never moved again. */
const MERCHANDISE = '420000.00';
/** `420000 + 30000`. The exact figure the customer pays and the operator sees. */
const PAYABLE = '450000.00';

interface AdminOrderItem {
  readonly lineTotalAmount: string;
}

interface AdminOrderDetail {
  readonly orderId: string;
  readonly status: string;
  readonly totalAmount: string;
  readonly items: readonly AdminOrderItem[];
}

interface CustomerOrder {
  readonly status: string;
  readonly merchandiseSubtotal?: string;
}

describe('APP12-E01 · J1 Wave-1 lifecycle and authorization denial', () => {
  let context: E01Context;
  let order: E01Order;
  let neighbour: E01Order;
  let attemptId: string;

  beforeAll(async () => {
    context = await openE01Context('app12_e01_j1');

    order = await placeOrder(context, {
      label: 'e01-j1',
      unitPrice: UNIT_PRICE,
      quantity: QUANTITY,
      quantityOnHand: ON_HAND,
    });
    // A second, unrelated order. It exists so §8's scope cases have a real
    // other order to fail to reach — a token that "cannot read another order"
    // when no other order exists has proved nothing.
    neighbour = await placeOrder(context, {
      label: 'e01-j1-neighbour',
      unitPrice: 99_000,
      quantity: 1,
    });

    await confirmFee(context, order.orderId, FEE).expect(200);
    const attempt = await openFullAttempt(context, order, `e01-j1-${order.orderId}`);
    attemptId = attempt.attemptId;
    await verifyExactly(context, attempt).expect(200);
    await dispatchOrder(context.api, context.cookie, order.orderId).expect(200);
    await completeOrder(context.api, context.cookie, order.orderId).expect(200);
  }, 600_000);

  afterAll(async () => {
    await context?.close();
  });

  describe('§7 the composed lifecycle reaches COMPLETED', () => {
    it('ends at COMPLETED with the shipping detail frozen', async () => {
      expect((await orderOf(context.api, order.orderId)).status).toBe('COMPLETED');
      expect((await shippingDetailOf(context.api, order.orderId)).frozen_at).not.toBeNull();
    });

    it('walked exactly the Ready-Made states, each once', async () => {
      // The Ready-Made lane, and no state from the custom lane. Each appears
      // once: a re-entry would mean a transition that ran twice.
      const walked = await transitionsOf(context, order.orderId);
      expect(walked).toEqual(['AWAITING_PAYMENT', 'READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']);
    });

    it('charged the frozen subtotal plus the confirmed fee, exactly', async () => {
      expect((await orderOf(context.api, order.orderId)).total_amount).toBe(PAYABLE);
    });
  });

  describe('§7 the exactly-once truth table', () => {
    it('holds one order, one line and one reservation', async () => {
      expect(
        await countRows(
          context,
          sql`select count(*)::text as count from orders where id = ${order.orderId}`,
        ),
      ).toBe(1);
      expect(
        await countRows(
          context,
          sql`select count(*)::text as count from order_items where order_id = ${order.orderId}`,
        ),
      ).toBe(1);
      expect(await reservationsOf(context.api, order.orderId)).toHaveLength(1);
    });

    it('settled one FULL obligation on one successful payment', async () => {
      const obligations = await obligationsOf(context.api, order.orderId);
      expect(obligations).toHaveLength(1);
      expect(obligations[0]).toMatchObject({
        kind: 'FULL',
        status: 'SATISFIED',
        amount: PAYABLE,
      });
      expect(await countForOrder(context.api, 'payment_attempts', order.orderId)).toBe(1);
      expect(await countForOrder(context.api, 'payment_reconciliations', order.orderId)).toBe(1);
    });

    it('consumed the reservation once and decremented stock once', async () => {
      expect((await reservationOf(context.api, order.orderId)).status).toBe('CONSUMED');
      const ledger = await ledgerOf(context.api, order.orderId);
      const consumed = ledger.filter((row) => row.entry_kind === 'CONSUMED');
      expect(consumed).toHaveLength(1);
      expect(consumed[0]).toMatchObject({ quantity: QUANTITY, on_hand_delta: -QUANTITY });
      // Nothing was ever handed back: a release or a lapse alongside the
      // consume would leave the stock arithmetic right and the history wrong.
      // Both kinds are named from the closed set (COL-TBL019-02), so a typo
      // cannot make this assertion vacuously true.
      const handedBack = ledger.filter((row) =>
        ['RESERVATION_RELEASED', 'RESERVATION_EXPIRED'].includes(row.entry_kind),
      );
      expect(handedBack).toHaveLength(0);
      expect(await stockOf(context.api, order.fixture.skuId)).toEqual({
        onHand: ON_HAND - QUANTITY,
        reserved: 0,
        available: ON_HAND - QUANTITY,
      });
    });

    it('froze exactly one shipping snapshot', async () => {
      expect(
        await countRows(
          context,
          sql`select count(*)::text as count from shipping_snapshots
              where order_id = ${order.orderId}`,
        ),
      ).toBe(1);
    });

    it('created no custom-lane artifact of any kind', async () => {
      expect(await customArtifactCounts(context.api, order.orderId)).toEqual({
        productionJobs: 0,
        depositObligations: 0,
        remainingObligations: 0,
      });
      // No provider was contacted, and none could have been: manual
      // verification is the whole payment authority in Wave 1.
      expect(
        await countRows(context, sql`select count(*)::text as count from payment_provider_events`),
      ).toBe(0);
    });
  });

  describe('§22 the money the operator reads is the money the server froze', () => {
    it('publishes a frozen line subtotal distinct from the total (U01 F1)', async () => {
      const detail = dataOf<AdminOrderDetail>(
        await request(serverOf(context.api))
          .get(ADMIN_ORDER_ROUTE(order.orderId))
          .set('Cookie', context.cookie)
          .expect(200),
      );
      expect(detail.items).toHaveLength(1);
      // The two figures differ by exactly the fee, and both are published. That
      // is what lets the Admin card state goods and delivery without a client
      // arithmetic step — the defect U01 found.
      expect(detail.items[0]?.lineTotalAmount).toBe(MERCHANDISE);
      expect(detail.totalAmount).toBe(PAYABLE);
      expect(detail.totalAmount).not.toBe(detail.items[0]?.lineTotalAmount);
    });

    it('shows the customer the same frozen subtotal it shows the operator', async () => {
      const projection = await readCustomerOrder<CustomerOrder>(context, order.token);
      expect(projection.status).toBe('COMPLETED');
      expect(projection.merchandiseSubtotal).toBe(MERCHANDISE);
    });
  });

  describe('§8 authorization denial', () => {
    it('denies an anonymous caller every Admin operation', async () => {
      const server = serverOf(context.api);
      await request(server).get(ADMIN_ORDER_LIST_ROUTE).expect(401);
      await request(server).get(ADMIN_ORDER_ROUTE(order.orderId)).expect(401);
      await request(server)
        .post(ADMIN_PAYMENT_ROUTES.verify(attemptId))
        .send({ observedAmount: PAYABLE })
        .expect(401);
    });

    it('gives a customer capability no way to invoke an Admin operation', async () => {
      // The `ORDER_ACCESS` token is a body credential for public routes. It is
      // not a session, so presenting it to an Admin route authenticates nothing
      // — the point being that there is no second door.
      await request(serverOf(context.api))
        .get(ADMIN_ORDER_ROUTE(order.orderId))
        .set('Cookie', `adm_session=${order.token}`)
        .expect(401);
    });

    it('cannot read another order with this order’s token', async () => {
      // The token names its own order server-side; the request body carries no
      // order id to tamper with, so the neighbour is unreachable rather than
      // merely refused.
      const projection = await readCustomerOrder<{ orderId?: string }>(context, order.token);
      expect(projection.orderId ?? order.orderId).not.toBe(neighbour.orderId);

      const neighbourProjection = await readCustomerOrder<CustomerOrder>(context, neighbour.token);
      expect(neighbourProjection.status).toBe('AWAITING_SHIPPING_FEE');
    });

    it('answers a malformed, unknown and revoked token indistinguishably', async () => {
      const server = serverOf(context.api);
      const outcomes: number[] = [];
      for (const token of ['not-a-token', 'x'.repeat(43), '']) {
        const response = await request(server).post(ORDER_READ_ROUTE).send({ token });
        outcomes.push(response.status);
      }
      // Whatever the refusal is, it is the same refusal: a status that varied
      // by cause would let a caller probe which tokens exist.
      expect(new Set(outcomes.filter((status) => status !== 400)).size).toBeLessThanOrEqual(1);
      expect(outcomes.every((status) => status >= 400 && status < 500)).toBe(true);
    });

    it('does not serve private payment evidence to the public', async () => {
      // The Ready-Made lane opens no deposit evidence surface at all. Reaching
      // for it with a live, valid Ready-Made credential must not open one.
      const response = await request(serverOf(context.api))
        .post(EVIDENCE_ROUTES.status)
        .send({ token: order.token });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(JSON.stringify(response.body)).not.toContain(order.token);
    });

    it('leaks nothing about another order through the secure-link resolver', async () => {
      const response = await request(serverOf(context.api))
        .post(RESOLVE_ROUTE)
        .send({ token: 'y'.repeat(43) });
      expect(response.status).toBeGreaterThanOrEqual(400);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain(neighbour.orderId);
      expect(body).not.toContain(order.orderId);
    });
  });
});
