/**
 * `APP12-B03` §33, §34, §41 — the three races the fee path can actually lose,
 * run against real PostgreSQL through the real HTTP surface.
 *
 * Each case fires genuinely concurrent requests, so each runs on its own pooled
 * connection in its own transaction. Nothing is stubbed and no lock is
 * simulated: the arbiters under test are the delivered ones — the `orders` row
 * lock every path opens with, the `shipping_details` row lock, and
 * `uq_payment_obligations__order_kind__live`, the partial unique index that
 * permits one live obligation per (order, kind).
 *
 * What is asserted is the **final committed world**, not which caller won. Both
 * orderings are legitimate; what is not legitimate is a world that is
 * internally inconsistent — two live obligations, a total that disagrees with
 * the obligation, two payment-window resets, or an order that is payable while
 * its stock has gone back on sale.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  createReadyMadeOrder,
  obligationsOf,
  orderOf,
  reservationOf,
  seedAdminSession,
  serverOf,
  SHIPPING_ROUTE,
  shippingBody,
} from '../support/ready-made-shipping-fixture';

const DAY_MS = 86_400_000;

describe('APP12-B03 — Ready-Made shipping fee concurrency', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b03_race');
    cookie = await seedAdminSession(context);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  const put = (orderId: string, fee: string) =>
    request(serverOf(context))
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount: fee }));

  /** The live obligation, and the proof that there is exactly one. */
  const liveFullOf = async (orderId: string) => {
    const rows = await obligationsOf(context, orderId);
    const live = rows.filter((one) => one.status === 'PENDING' || one.status === 'SATISFIED');
    expect(live).toHaveLength(1);
    return { all: rows, live: live[0] };
  };

  /** §33 — two first fee writes, racing on an unpriced order. */
  describe('two concurrent first fee writes', () => {
    let orderId: string;

    beforeAll(async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'race1',
        unitPrice: 250_000,
        quantity: 1,
      });
      orderId = order.orderId;
      await Promise.all([put(orderId, '30000'), put(orderId, '45000')]);
    });

    it('ends with one coherent payable order', async () => {
      const order = await orderOf(context, orderId);
      expect(order.status).toBe('AWAITING_PAYMENT');
    });

    it('leaves exactly one live FULL whose amount is the order total', async () => {
      const { live } = await liveFullOf(orderId);
      const order = await orderOf(context, orderId);
      expect(live?.kind).toBe('FULL');
      expect(live?.status).toBe('PENDING');
      // The three figures agree, whichever writer committed last.
      expect(live?.amount).toBe(order.total_amount);
      expect(['280000.00', '295000.00']).toContain(order.total_amount);
    });

    it('agrees with the stored shipping fee', async () => {
      const { live } = await liveFullOf(orderId);
      const { rows } = await context.database.client.db.execute<{ fee_amount: string }>(
        sql`select fee_amount from shipping_details where order_id = ${orderId}`,
      );
      // subtotal 250000 + the stored fee is the live obligation's amount. If the
      // loser had serialised into a correction without recomposing, these two
      // would disagree.
      const expected = 250_000 + Number(rows[0]?.fee_amount ?? '0');
      expect(Number(live?.amount)).toBe(expected);
    });

    it('resets the payment window exactly once', async () => {
      const reservation = await reservationOf(context, orderId);
      expect(reservation.status).toBe('RESERVED');
      const expiresAt = Date.parse(reservation.expires_at ?? '');
      // One reset lands within a minute of now + 24h. A double reset would
      // still land there, so the real proof is the single reservation row and
      // the single AWAITING_PAYMENT transition asserted below.
      expect(Math.abs(expiresAt - (Date.now() + DAY_MS))).toBeLessThan(60_000);
    });

    it('records exactly one transition into AWAITING_PAYMENT', async () => {
      const { rows } = await context.database.client.db.execute<{ count: string }>(sql`
        select count(*)::text as count from order_transitions
        where order_id = ${orderId} and to_status = 'AWAITING_PAYMENT'
      `);
      // The window reset and this transition happen in the same transaction, so
      // one transition is one reset (§16).
      expect(Number(rows[0]?.count)).toBe(1);
    });

    it('creates no sibling live obligations', async () => {
      const { all } = await liveFullOf(orderId);
      expect(all.every((one) => one.kind === 'FULL')).toBe(true);
      // Any predecessor must be properly retired and linked, never left PENDING.
      for (const row of all.filter((one) => one.status !== 'PENDING')) {
        expect(row.status).toBe('SUPERSEDED');
        expect(row.superseded_by_obligation_id).not.toBeNull();
      }
    });
  });

  /** §34 — two corrections, racing on an already-priced order. */
  describe('two concurrent fee corrections', () => {
    let orderId: string;
    let firstWindow: string | null;

    beforeAll(async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'race2',
        unitPrice: 250_000,
        quantity: 1,
      });
      orderId = order.orderId;
      await put(orderId, '30000').expect(200);
      firstWindow = (await reservationOf(context, orderId)).expires_at;

      await Promise.all([put(orderId, '45000'), put(orderId, '10000')]);
    });

    it('serialises into one supersession chain with one live FULL', async () => {
      const { all, live } = await liveFullOf(orderId);
      expect(live?.status).toBe('PENDING');

      // Every retired row points at its successor, and no two rows point at the
      // same one — that is what makes it a chain rather than a fork.
      const retired = all.filter((one) => one.status === 'SUPERSEDED');
      expect(retired.length).toBeGreaterThanOrEqual(1);
      const targets = retired.map((one) => one.superseded_by_obligation_id);
      expect(new Set(targets).size).toBe(targets.length);
      expect(targets.every((one) => one !== null)).toBe(true);
    });

    it('keeps the shipping fee, the order total and the live FULL in agreement', async () => {
      const { live } = await liveFullOf(orderId);
      const order = await orderOf(context, orderId);
      const { rows } = await context.database.client.db.execute<{ fee_amount: string }>(
        sql`select fee_amount from shipping_details where order_id = ${orderId}`,
      );
      expect(live?.amount).toBe(order.total_amount);
      expect(Number(live?.amount)).toBe(250_000 + Number(rows[0]?.fee_amount ?? '0'));
      expect(['295000.00', '260000.00']).toContain(order.total_amount);
    });

    it('does not extend the payment window', async () => {
      // §16 — the reset belongs to the first confirmation alone, and two racing
      // corrections must not manufacture one between them.
      expect((await reservationOf(context, orderId)).expires_at).toBe(firstWindow);
      expect((await orderOf(context, orderId)).status).toBe('AWAITING_PAYMENT');
    });
  });

  /**
   * §41 — a fee write against the expiry sweep.
   *
   * The sweep is driven here as a direct SQL expiry racing the HTTP write,
   * rather than through the worker: this suite is about the API transaction's
   * arbitration, and the worker's own half is proved in the worker suite. Both
   * contend on the same reservation row, so only the two coherent outcomes in
   * §23 are reachable.
   */
  describe('a fee write racing reservation expiry', () => {
    it('lands on one coherent state, never a partial one', async () => {
      for (const attempt of [1, 2, 3]) {
        const { orderId } = await createReadyMadeOrder(context, {
          label: `race3-${String(attempt)}`,
          unitPrice: 250_000,
          quantity: 1,
        });

        // Make the reservation due right now, so both paths are live at once.
        await context.database.client.db.execute(
          sql`update inventory_reservations set expires_at = now() - interval '1 minute'
              where order_id = ${orderId}`,
        );

        const expire = context.database.client.db.execute(sql`
          with due as (
            select id from inventory_reservations
            where order_id = ${orderId} and status = 'RESERVED' and expires_at <= now()
            for update
          )
          update inventory_reservations r set status = 'EXPIRED', terminalized_at = now()
          from due where r.id = due.id
        `);

        const [, saved] = await Promise.all([expire, put(orderId, '30000')]);

        const order = await orderOf(context, orderId);
        const reservation = await reservationOf(context, orderId);
        const rows = await obligationsOf(context, orderId);
        const live = rows.filter((one) => one.status === 'PENDING');

        if (saved.status === 200) {
          // Admin won: priced, payable, still holding stock.
          expect(order.status).toBe('AWAITING_PAYMENT');
          expect(reservation.status).toBe('RESERVED');
          expect(live).toHaveLength(1);
          expect(live[0]?.amount).toBe(order.total_amount);
        } else {
          // Expiry won: the write was refused and nothing commercial moved.
          expect(saved.status).toBe(409);
          expect(reservation.status).toBe('EXPIRED');
          expect(rows).toHaveLength(0);
          expect(order.status).toBe('AWAITING_SHIPPING_FEE');
        }

        // §23's two forbidden worlds, asserted directly.
        expect(order.status === 'CANCELLED' && live.length > 0).toBe(false);
        expect(order.status === 'AWAITING_PAYMENT' && reservation.status === 'EXPIRED').toBe(false);
      }
    });
  });
});
