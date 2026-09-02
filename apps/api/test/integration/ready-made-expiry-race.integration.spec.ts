/**
 * `APP12-B03-C1` — the Admin shipping-fee write against the **real** Ready-Made
 * reservation-expiry sweep, on real PostgreSQL, in two real processes.
 *
 * ## What this replaces, and why
 *
 * `APP12-B03` §41 raced the fee write against a hand-written
 * `UPDATE inventory_reservations set status = 'EXPIRED'`. That statement is not
 * the expiry business path — it is one sub-step of it — and the step it left
 * out is the one that cancels the order. So the suite necessarily observed, and
 * then asserted as legitimate:
 *
 * ```text
 * 409 refused + reservation EXPIRED + order AWAITING_SHIPPING_FEE
 * ```
 *
 * The Product Owner rejected that world:
 * `READY_MADE_ACTIVE_ORDER_WITH_EXPIRED_RESERVATION = FORBIDDEN`. It was never
 * reachable through the delivered runtime — `ExpireReadyMadeReservationsUseCase`
 * expires the reservation and cancels the order in **one** transaction — it was
 * manufactured by the test's stand-in.
 *
 * ## How the real path is raced
 *
 * `apps/api` may not import `apps/worker`, so the sweep runs where it lives: in
 * its own OS process, over the built worker `dist`, against this suite's
 * disposable database (`worker-expiry-process.ts`). Two processes, two pools,
 * two transaction streams, one database — which is what the deployed system is.
 * No mutex, no mock arbiter, no serialisation of the racers: the only arbiter is
 * the `orders` row lock both paths open with.
 *
 * Every case asserts the **settled** world, after both actors have committed.
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
import {
  startWorkerExpiryProcess,
  waitForBlockedSession,
  type WorkerExpiryProcess,
} from '../support/worker-expiry-process';

const DAY_MS = 86_400_000;

describe('APP12-B03-C1 — Ready-Made fee write against the real expiry sweep', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;
  let sweep: WorkerExpiryProcess;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b03_c1_expiry');
    cookie = await seedAdminSession(context);
    sweep = await startWorkerExpiryProcess(context);
  }, 300_000);

  afterAll(async () => {
    await sweep?.close();
    await context?.close();
  });

  const db = () => context.database.client.db;

  const put = (orderId: string, fee: string) =>
    request(serverOf(context))
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount: fee }));

  /** Makes the order's reservation due, by the database's own clock. */
  const makeDue = async (orderId: string, secondsAgo: number): Promise<void> => {
    await db().execute(sql`
      update inventory_reservations
         set expires_at = now() - make_interval(secs => ${secondsAgo})
       where order_id = ${orderId}
    `);
  };

  /** The full committed world of one order, read after everything settled. */
  const settledWorld = async (orderId: string) => {
    const [order, reservation, obligations] = await Promise.all([
      orderOf(context, orderId),
      reservationOf(context, orderId),
      obligationsOf(context, orderId),
    ]);
    return {
      order,
      reservation,
      obligations,
      pending: obligations.filter((one) => one.status === 'PENDING'),
    };
  };

  /** Verbatim the sweep's own candidate predicate, for the staleness proof. */
  const dueCandidateCount = async (): Promise<number> => {
    const { rows } = await db().execute<{ count: string }>(sql`
      select count(*)::text as count
        from inventory_reservations r join orders o on o.id = r.order_id
       where r.status = 'RESERVED' and r.expires_at is not null and r.expires_at <= now()
         and o.origin = 'READY_MADE'
         and o.status in ('AWAITING_SHIPPING_FEE', 'AWAITING_PAYMENT')
    `);
    return Number(rows[0]?.count ?? '0');
  };

  /**
   * §8 — the sweep commits first, and the Admin write arrives afterwards.
   *
   * The order is already `CANCELLED` when the write takes its lock, so the
   * refusal is `ORDER_SHIPPING_FEE_NOT_SETTABLE` rather than a reservation
   * complaint: there is no move out of `CANCELLED` in LC-14, and pricing an
   * order is not one.
   */
  describe('expiry first, then the Admin write', () => {
    let orderId: string;

    beforeAll(async () => {
      ({ orderId } = await createReadyMadeOrder(context, {
        label: 'c1-expiry-first',
        unitPrice: 250_000,
        quantity: 1,
      }));
      await makeDue(orderId, 60);
      expect((await sweep.runPass()).expired).toBeGreaterThanOrEqual(1);
    }, 120_000);

    it('cancels the order with the reservation, in the sweep transaction', async () => {
      const world = await settledWorld(orderId);
      expect(world.reservation.status).toBe('EXPIRED');
      expect(world.order.status).toBe('CANCELLED');
      expect(world.obligations).toHaveLength(0);
    });

    it('refuses the later Admin write and revives nothing', async () => {
      const refused = await put(orderId, '30000');
      expect(refused.status).toBe(409);
      expect((refused.body as { code?: string }).code).toBe('ORDER_SHIPPING_FEE_NOT_SETTABLE');

      const world = await settledWorld(orderId);
      expect(world.order.status).toBe('CANCELLED');
      expect(world.reservation.status).toBe('EXPIRED');
      expect(world.obligations).toHaveLength(0);
    });
  });

  /**
   * §7, §11, §12 — a candidate that stops being due while the pass is running.
   *
   * The pass is pinned open on a *different* candidate, whose `orders` row this
   * suite holds locked. That is what makes the second candidate genuinely
   * stale: it was listed as due by the unlocked scan, and the Admin write then
   * commits its `+24h` reset before the pass ever reaches it. Nothing about the
   * two racers is serialised — the blocker is a third order.
   */
  describe('a candidate that stopped being due mid-pass', () => {
    let blockerId: string;
    let targetId: string;
    let examined: number;
    let skipped: number;
    let dueWhenScanned: number;

    beforeAll(async () => {
      ({ orderId: blockerId } = await createReadyMadeOrder(context, {
        label: 'c1-stale-blocker',
        unitPrice: 250_000,
        quantity: 1,
      }));
      ({ orderId: targetId } = await createReadyMadeOrder(context, {
        label: 'c1-stale-target',
        unitPrice: 250_000,
        quantity: 1,
      }));
      // `ORDER BY r.expires_at, r.id` — the blocker is reached first.
      await makeDue(blockerId, 900);
      await makeDue(targetId, 300);

      const holder = await context.database.client.pool.connect();
      let pass: Promise<{ examined: number; skipped: number }>;
      try {
        await holder.query('begin');
        await holder.query('select id from orders where id = $1 for update', [blockerId]);

        pass = sweep.runPass();
        // The pass has listed its candidates and is now waiting on the blocker's
        // row. Until this returns, "stale" would be an assumption.
        await waitForBlockedSession(context);
        dueWhenScanned = await dueCandidateCount();

        await put(targetId, '30000').expect(200);
      } finally {
        await holder.query('rollback');
        holder.release();
      }
      ({ examined, skipped } = await pass);
    }, 120_000);

    it('had listed both reservations as due before the Admin write committed', () => {
      expect(dueWhenScanned).toBe(2);
      expect(examined).toBe(2);
    });

    it('re-checks due-ness under the lock and skips the reset candidate', () => {
      expect(skipped).toBe(1);
    });

    it('leaves the priced order payable, reserved and holding one live FULL', async () => {
      const world = await settledWorld(targetId);
      expect(world.order.status).toBe('AWAITING_PAYMENT');
      expect(world.reservation.status).toBe('RESERVED');
      expect(world.pending).toHaveLength(1);
      expect(world.pending[0]?.kind).toBe('FULL');
      expect(world.pending[0]?.amount).toBe(world.order.total_amount);
      // The window the Admin write set, not the one the sweep was holding.
      const expiresAt = Date.parse(world.reservation.expires_at ?? '');
      expect(Math.abs(expiresAt - (Date.now() + DAY_MS))).toBeLessThan(120_000);
    });

    it('still expires the candidate that stayed due', async () => {
      const world = await settledWorld(blockerId);
      expect(world.reservation.status).toBe('EXPIRED');
      expect(world.order.status).toBe('CANCELLED');
      expect(world.obligations).toHaveLength(0);
    });
  });

  /**
   * §6 — the genuine first-window race, started together and settled together.
   *
   * Both actors are live at once and the only arbiter is the `orders` row lock;
   * no attempt waits for the other to finish. The **sweep** is delayed by a few
   * milliseconds on half the attempts, because without that it wins every time:
   * its pass opens with one unlocked index scan, while the HTTP write first
   * routes, authenticates and validates a body. A stagger of a few milliseconds
   * is not serialisation — the loser's transaction is open and contending
   * either way — it is the only way to reach *both* orderings from this side of
   * the boundary, and both orderings are what §6 requires to be legal.
   *
   * The deterministic Admin-win proof is the stale-candidate case above, where
   * the Admin write provably commits first.
   */
  describe('a first fee write racing the real sweep', () => {
    const outcomes: string[] = [];

    beforeAll(async () => {
      // Two attempts with no stagger at all, two with the sweep held back by a
      // few milliseconds. Neither actor is ever run to completion alone.
      for (const [attempt, sweepDelayMs] of [
        [1, 0],
        [2, 0],
        [3, 30],
        [4, 60],
      ] as const) {
        const { orderId } = await createReadyMadeOrder(context, {
          label: `c1-race-${String(attempt)}`,
          unitPrice: 250_000,
          quantity: 1,
        });
        await makeDue(orderId, 60);

        const pass =
          sweepDelayMs === 0
            ? sweep.runPass()
            : new Promise<void>((resolve) => setTimeout(resolve, sweepDelayMs)).then(() =>
                sweep.runPass(),
              );
        const [, saved] = await Promise.all([pass, put(orderId, '30000')]);
        outcomes.push(`${orderId}:${String(saved.status)}`);
      }
    }, 240_000);

    it('reaches both legal orderings across the attempts', () => {
      const statuses = outcomes.map((record) => record.split(':')[1]);
      expect(statuses).toContain('200');
      expect(statuses).toContain('409');
    });

    it('settles every attempt on one of the two legal worlds', async () => {
      for (const record of outcomes) {
        const [orderId, status] = record.split(':');
        const world = await settledWorld(orderId ?? '');

        if (status === '200') {
          // Admin won the lock: priced, payable, still holding its stock.
          expect(world.order.status).toBe('AWAITING_PAYMENT');
          expect(world.reservation.status).toBe('RESERVED');
          expect(world.pending).toHaveLength(1);
          expect(world.pending[0]?.amount).toBe(world.order.total_amount);
        } else {
          // The sweep won: cancelled, expired, and no money was ever created.
          expect(status).toBe('409');
          expect(world.order.status).toBe('CANCELLED');
          expect(world.reservation.status).toBe('EXPIRED');
          expect(world.obligations).toHaveLength(0);
        }
      }
    });
  });

  /**
   * §9 — the second expirable window, and the obligation that belongs to it.
   *
   * The order is priced through the real Admin write first, so the `FULL` being
   * cancelled is one `APP12-B03` actually created.
   */
  describe('the payment window of a priced order', () => {
    let orderId: string;
    let obligationId: string;

    beforeAll(async () => {
      ({ orderId } = await createReadyMadeOrder(context, {
        label: 'c1-payment-window',
        unitPrice: 250_000,
        quantity: 1,
      }));
      await put(orderId, '30000').expect(200);
      obligationId = (await obligationsOf(context, orderId))[0]?.id ?? '';
      await makeDue(orderId, 60);
      expect((await sweep.runPass()).expired).toBeGreaterThanOrEqual(1);
    }, 120_000);

    it('expires the reservation, cancels the FULL and cancels the order together', async () => {
      const world = await settledWorld(orderId);
      expect(world.reservation.status).toBe('EXPIRED');
      expect(world.order.status).toBe('CANCELLED');
      expect(world.pending).toHaveLength(0);
      expect(world.obligations.find((one) => one.id === obligationId)?.status).toBe('CANCELLED');
    });

    it('is idempotent — a second pass changes nothing', async () => {
      const second = await sweep.runPass();
      expect(second.expired).toBe(0);

      const world = await settledWorld(orderId);
      expect(world.order.status).toBe('CANCELLED');
      expect(world.obligations.find((one) => one.id === obligationId)?.status).toBe('CANCELLED');
    });
  });

  /**
   * §2, §17.8–§17.10 — the three worlds that must not exist anywhere in this
   * database once every case above has settled.
   */
  describe('the forbidden final states', () => {
    const census = async (predicate: ReturnType<typeof sql>): Promise<number> => {
      const { rows } = await db().execute<{ count: string }>(predicate);
      return Number(rows[0]?.count ?? '0');
    };

    it('has no active Ready-Made order holding an expired reservation', async () => {
      expect(
        await census(sql`
          select count(*)::text as count from orders o
            join inventory_reservations r on r.order_id = o.id
           where o.origin = 'READY_MADE'
             and o.status in ('AWAITING_SHIPPING_FEE', 'AWAITING_PAYMENT')
             and r.status = 'EXPIRED'
        `),
      ).toBe(0);
    });

    it('has no cancelled order still carrying a live PENDING obligation', async () => {
      expect(
        await census(sql`
          select count(*)::text as count from orders o
            join payment_obligations p on p.order_id = o.id
           where o.origin = 'READY_MADE' and o.status = 'CANCELLED' and p.status = 'PENDING'
        `),
      ).toBe(0);
    });

    it('has no cancelled order still holding reserved stock', async () => {
      expect(
        await census(sql`
          select count(*)::text as count from orders o
            join inventory_reservations r on r.order_id = o.id
           where o.origin = 'READY_MADE' and o.status = 'CANCELLED' and r.status = 'RESERVED'
        `),
      ).toBe(0);
    });
  });
});
