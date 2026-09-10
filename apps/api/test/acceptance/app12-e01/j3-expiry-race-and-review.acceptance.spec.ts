/**
 * `APP12-E01` journey **J3** — the recovery matrix: step-up and review (§13),
 * the expiry and access negatives (§14), reservation expiry (§15) and the stock
 * race (§16).
 *
 * ### Why these four belong together
 *
 * Each one is the system refusing something, and the interesting failure is
 * always the same shape: a refusal that refused *and also did something*. A
 * lapsed reservation that released twice, a revoked grant that still read, a
 * losing racer that left a phantom reservation behind — none of those is visible
 * from a status code. So every case below asserts the refusal **and** the rows it
 * was supposed to leave alone.
 *
 * `APP12-B03-C1` owns the sweep-versus-writer orderings and `APP12-B02` owns the
 * oversell arbiter; neither is re-run. What is asserted here is the composed
 * settled state afterwards.
 *
 * ### The real sweep, in its own process
 *
 * Expiry is the worker's, not the API's, so the sweep runs as the built worker in
 * a child process and the parent only says "go". Nothing in this file cancels an
 * order, releases inventory or writes a ledger entry; the worker does all three,
 * and the cases read what it left.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  createBody,
  seedAnotherChallenge,
  seedReadyMadeContext,
  type ReadyMadeFixture,
} from '../../support/ready-made-order-fixture';
import { obligationsOf, orderOf, reservationOf } from '../../support/ready-made-shipping-fixture';
import { ORDER_READ_ROUTE } from '../../support/ready-made-access-fixture';
import { ADMIN_PAYMENT_ROUTES } from '../../support/admin-payment-fixture';
import {
  ledgerOf,
  reservationsOf,
  stockOf,
  verifyAttempt,
} from '../../support/ready-made-fulfillment-fixture';
import {
  confirmFee,
  dataOf,
  expireOrderAccess,
  makeReservationDue,
  openE01Context,
  openFullAttempt,
  placeOrder,
  revokeOrderAccess,
  serverOf,
  transitionsOf,
  verifyExactly,
  type E01Context,
  type E01Order,
} from './app12-e01-context';

const CREATE_ROUTE = '/api/public/ready-made-orders';
const UNIT_PRICE = 160_000;
const FEE = '20000';

interface DecisionPayload {
  readonly attemptStatus: string;
  readonly orderStatus: string;
}

describe('APP12-E01 · J3 step-up, expiry, access negatives and the stock race', () => {
  let context: E01Context;

  beforeAll(async () => {
    context = await openE01Context('app12_e01_j3');
  }, 600_000);

  afterAll(async () => {
    await context?.close();
  });

  describe('§13 step-up and PAYMENT_UNDER_REVIEW', () => {
    let order: E01Order;
    let decision: DecisionPayload;

    beforeAll(async () => {
      order = await placeOrder(context, {
        label: 'e01-j3-review',
        unitPrice: UNIT_PRICE,
        quantity: 1,
        quantityOnHand: 6,
      });
      await confirmFee(context, order.orderId, FEE).expect(200);
      const attempt = await openFullAttempt(context, order, `e01-j3-review-${order.orderId}`);
      // The operator types a figure that is not the one the customer's screen
      // showed. The delivered lane routes that to review rather than guessing.
      decision = dataOf<DecisionPayload>(
        await verifyAttempt(context.api, context.cookie, attempt.attemptId, {
          // A well-formed amount that is not the one the customer's screen
          // showed — the shape of a real mis-keyed reconciliation, not a
          // malformed request.
          observedAmount: '159000',
          observedTransferReference: attempt.transferReference,
        }).expect(200),
      );
    }, 600_000);

    it('verified the customer by email only — no SMS challenge exists', async () => {
      // `APP12-N01` made email the verification identity. A `PHONE` challenge on
      // this customer would mean an SMS lane had reappeared.
      const { rows } = await context.api.database.client.db.execute<{ kind: string }>(sql`
        select c.contact_kind as kind from contact_verification_challenges c
        join customer_contact_points p on p.id = c.contact_point_id
        where p.customer_id = ${order.fixture.customerId}
      `);
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((row) => row.kind))).toEqual(new Set(['EMAIL']));
    });

    it('puts the attempt under review and moves the order nowhere', async () => {
      expect(decision.attemptStatus).toBe('REQUIRES_REVIEW');
      expect((await orderOf(context.api, order.orderId)).status).toBe('AWAITING_PAYMENT');
    });

    it('creates no duplicate order and no duplicate reservation', async () => {
      expect(await reservationsOf(context.api, order.orderId)).toHaveLength(1);
      expect((await reservationOf(context.api, order.orderId)).status).toBe('RESERVED');
      expect(
        await countOf(sql`select count(*)::text as count from orders
                          where customer_id = ${order.fixture.customerId}`),
      ).toBe(1);
    });

    it('consumes no stock while the workshop reconciles', async () => {
      expect(await stockOf(context.api, order.fixture.skuId)).toEqual({
        onHand: 6,
        reserved: 1,
        available: 5,
      });
      expect(
        (await ledgerOf(context.api, order.orderId)).filter((row) => row.entry_kind === 'CONSUMED'),
      ).toHaveLength(0);
    });

    it('leaves the customer an order that is still payable, not a dead end', async () => {
      // The customer-side `PAYMENT_UNDER_REVIEW` presentation is derived from
      // `AWAITING_PAYMENT` plus an opened attempt (`APP12-S03` §12C) — it is not
      // a ninth order state, and the contract here is what that derivation reads.
      const projection = await readOrder(order.token);
      expect(projection.status).toBe('AWAITING_PAYMENT');
    });

    it('gives the operator a reconciliation path', async () => {
      // The review route exists and is behind the operator guard. What it
      // decides is `APP7-B04`'s; that it is reachable only by an operator is
      // the composition fact E01 owns.
      const attemptId = await latestAttemptId(order.orderId);
      await request(serverOf(context.api))
        .post(ADMIN_PAYMENT_ROUTES.review(attemptId))
        .send({})
        .expect(401);
    });
  });

  describe('§14 expiry and access negatives', () => {
    let expired: E01Order;
    let revoked: E01Order;
    let live: E01Order;

    beforeAll(async () => {
      expired = await placeOrder(context, {
        label: 'e01-j3-expired',
        unitPrice: UNIT_PRICE,
        quantity: 1,
      });
      revoked = await placeOrder(context, {
        label: 'e01-j3-revoked',
        unitPrice: UNIT_PRICE,
        quantity: 1,
      });
      live = await placeOrder(context, {
        label: 'e01-j3-live',
        unitPrice: UNIT_PRICE,
        quantity: 1,
      });
      await expireOrderAccess(context, expired.orderId);
      await revokeOrderAccess(context, revoked.orderId);
    }, 600_000);

    it('refuses an expired verification challenge at checkout', async () => {
      const stale = await seedReadyMadeContext(context.api.database, {
        label: 'e01-j3-stale-challenge',
        basePriceAmount: UNIT_PRICE,
        challengeExpiresInHours: -1,
      });
      const response = await request(serverOf(context.api))
        .post(CREATE_ROUTE)
        .send(createBody(stale, { quantity: 1 }));
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      // And nothing was reserved on the way to refusing.
      expect(await stockOf(context.api, stale.skuId)).toEqual({
        onHand: 10,
        reserved: 0,
        available: 10,
      });
    });

    it('refuses an expired and a revoked grant the same way a never-existed one is refused', async () => {
      const server = serverOf(context.api);
      const statuses = await Promise.all(
        [expired.token, revoked.token, 'z'.repeat(43)].map(async (token) => {
          const response = await request(server).post(ORDER_READ_ROUTE).send({ token });
          return response.status;
        }),
      );
      // One refusal for three different causes: expiry, revocation and never
      // having existed must be indistinguishable, or the status is an oracle.
      expect(new Set(statuses).size).toBe(1);
      expect(statuses[0]).toBeGreaterThanOrEqual(400);
    });

    it('discloses nothing about any other order when it refuses', async () => {
      const response = await request(serverOf(context.api))
        .post(ORDER_READ_ROUTE)
        .send({ token: revoked.token });
      const body = JSON.stringify(response.body);
      for (const leaked of [revoked.orderId, expired.orderId, live.orderId]) {
        expect(body).not.toContain(leaked);
      }
    });

    it('leaves the live order’s access working', async () => {
      // The negatives above must be about those grants, not about the resolver
      // having stopped working.
      expect((await readOrder(live.token)).status).toBe('AWAITING_SHIPPING_FEE');
    });

    it('treats a missing token as a cause-neutral refusal, not a hint', async () => {
      // The reload-with-no-fragment case. The server is told nothing, so it must
      // say nothing beyond "this cannot continue".
      const response = await request(serverOf(context.api)).post(ORDER_READ_ROUTE).send({});
      expect(response.status).toBeGreaterThanOrEqual(400);
      const body = JSON.stringify(response.body).toLowerCase();
      for (const cause of ['expire', 'revok', 'hết hạn', 'thu hồi']) {
        expect(body).not.toContain(cause);
      }
    });
  });

  describe('§15 reservation expiry', () => {
    let order: E01Order;
    let replay: Awaited<ReturnType<E01Context['sweep']['runPass']>>;

    beforeAll(async () => {
      order = await placeOrder(context, {
        label: 'e01-j3-expiry',
        unitPrice: UNIT_PRICE,
        quantity: 2,
        quantityOnHand: 7,
      });
      await makeReservationDue(context, order.orderId);
      await context.sweep.runPass();
      // A second pass over the same world. The order is already cancelled and
      // the units already back, so a pass that released again would double-count
      // stock that never moved.
      replay = await context.sweep.runPass();
    }, 600_000);

    it('expires the reservation exactly once', async () => {
      expect((await reservationOf(context.api, order.orderId)).status).toBe('EXPIRED');
      expect(await reservationsOf(context.api, order.orderId)).toHaveLength(1);
    });

    it('releases the inventory exactly once', async () => {
      // The closed movement-kind set names this `RESERVATION_EXPIRED`
      // (COL-TBL019-02): a lapse is not the same movement as a deliberate
      // release, and the ledger keeps the two apart.
      const released = (await ledgerOf(context.api, order.orderId)).filter(
        (row) => row.entry_kind === 'RESERVATION_EXPIRED',
      );
      expect(released).toHaveLength(1);
      expect(await stockOf(context.api, order.fixture.skuId)).toEqual({
        onHand: 7,
        reserved: 0,
        available: 7,
      });
    });

    it('cancels the order with the reservation, in one settlement', async () => {
      expect((await orderOf(context.api, order.orderId)).status).toBe('CANCELLED');
      expect((await transitionsOf(context, order.orderId)).at(-1)).toBe('CANCELLED');
    });

    it('does not double-release on a replayed pass', () => {
      expect(replay.expired).toBe(0);
    });

    it('refuses a stale payment against released inventory', async () => {
      // The customer's tab was open the whole time. Opening a payment now must
      // not reach inventory that has already gone back on the shelf.
      const response = await request(serverOf(context.api))
        .post('/api/public/orders/full-payment/attempts')
        .set('Idempotency-Key', `e01-j3-stale-${order.orderId}`)
        .send({ token: order.token });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await stockOf(context.api, order.fixture.skuId)).toEqual({
        onHand: 7,
        reserved: 0,
        available: 7,
      });
    });

    it('resets the hold once on the first fee, and not again on a correction', async () => {
      const priced = await placeOrder(context, {
        label: 'e01-j3-hold',
        unitPrice: UNIT_PRICE,
        quantity: 1,
      });
      const initialHold = (await reservationOf(context.api, priced.orderId)).expires_at;

      await confirmFee(context, priced.orderId, FEE).expect(200);
      const afterFirst = (await reservationOf(context.api, priced.orderId)).expires_at;
      await confirmFee(context, priced.orderId, '45000').expect(200);
      const afterCorrection = (await reservationOf(context.api, priced.orderId)).expires_at;

      // The first confirmation moves the hold to the canonical payment window;
      // the correction prices the same order and buys no further time.
      expect(afterFirst).not.toBe(initialHold);
      expect(afterCorrection).toBe(afterFirst);
    });
  });

  describe('§16 the stock race', () => {
    let fixture: ReadyMadeFixture;
    let statuses: readonly number[];

    beforeAll(async () => {
      // Exactly one unit. Two customers want it, at the same moment.
      fixture = await seedReadyMadeContext(context.api.database, {
        label: 'e01-j3-race',
        basePriceAmount: UNIT_PRICE,
        quantityOnHand: 1,
      });
      const second = await seedAnotherChallenge(context.api.database, fixture);
      const send = (key: string, challengeId?: string): request.Test =>
        request(serverOf(context.api))
          .post(CREATE_ROUTE)
          .set('Idempotency-Key', key)
          .send(
            createBody(fixture, {
              quantity: 1,
              ...(challengeId === undefined ? {} : { challengeId }),
            }),
          );
      const settled = await Promise.all([send('e01-j3-race-a'), send('e01-j3-race-b', second)]);
      statuses = settled.map((response) => response.status);
    }, 600_000);

    it('lets exactly one submission win', () => {
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    });

    it('refuses the loser deterministically, and not with a database error', () => {
      // 422 INSUFFICIENT_STOCK, the delivered refusal. Named exactly, because
      // "some 4xx" would also accept a validation failure that never reached
      // the stock anchor at all.
      expect(statuses.filter((status) => status === 422)).toHaveLength(1);
    });

    it('never lets stock go negative or over-reserve', async () => {
      const stock = await stockOf(context.api, fixture.skuId);
      expect(stock.onHand).toBe(1);
      expect(stock.reserved).toBe(1);
      expect(stock.available).toBe(0);
      expect(stock.available).toBeGreaterThanOrEqual(0);
    });

    it('leaves exactly one reservation and no phantom second one', async () => {
      expect(
        await countOf(sql`select count(*)::text as count from inventory_reservations r
                          join order_items i on i.order_id = r.order_id
                          where i.sku_id = ${fixture.skuId}`),
      ).toBe(1);
    });

    it('leaves no orphan order behind the refusal', async () => {
      expect(
        await countOf(sql`select count(*)::text as count from orders
                          where customer_id = ${fixture.customerId}`),
      ).toBe(1);
    });

    it('settles public availability at sold out', async () => {
      // The buyable fact the Storefront reads. One unit, one reservation, so
      // nothing is available — and no obligation was priced for the loser.
      expect((await stockOf(context.api, fixture.skuId)).available).toBe(0);
      const { rows } = await context.api.database.client.db.execute<{ id: string }>(sql`
        select id from orders where customer_id = ${fixture.customerId}
      `);
      const winner = rows[0]?.id;
      expect(winner).toBeDefined();
      expect(await obligationsOf(context.api, winner ?? '')).toHaveLength(0);
    });
  });

  async function readOrder(token: string): Promise<{ status: string }> {
    return dataOf<{ status: string }>(
      await request(serverOf(context.api)).post(ORDER_READ_ROUTE).send({ token }).expect(200),
    );
  }

  async function latestAttemptId(orderId: string): Promise<string> {
    const { rows } = await context.api.database.client.db.execute<{ id: string }>(sql`
      select a.id from payment_attempts a
      join payment_obligations o on o.id = a.payment_obligation_id
      where o.order_id = ${orderId} order by a.created_at desc limit 1
    `);
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new Error(`No payment attempt on order ${orderId}.`);
    }
    return id;
  }

  async function countOf(query: ReturnType<typeof sql>): Promise<number> {
    const { rows } = await context.api.database.client.db.execute<{ count: string }>(query);
    return Number(rows[0]?.count ?? '0');
  }
});
