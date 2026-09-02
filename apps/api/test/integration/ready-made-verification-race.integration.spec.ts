/**
 * `APP12-B05` §13, §14 — Admin `FULL` verification raced against the two
 * writers that can take the same order away from it.
 *
 * ## Two real racers, never a fixture standing in for one
 *
 * The expiry half spawns the **built worker** and runs
 * `ExpireReadyMadeReservationsUseCase` in its own OS process, exactly as
 * `APP12-B03-C1` established: `apps/api` may not import `apps/worker`, and a
 * hand-written `UPDATE inventory_reservations` is a fixture proving itself
 * rather than the system arbitrating. Two processes, two pools, one disposable
 * database, no mutex and no serialised racers.
 *
 * The fee-correction half needs no second process — `adminOrderShipping_save`
 * is an API operation — so both racers there are real HTTP calls issued
 * concurrently against the same order.
 *
 * ## What is being proved
 *
 * Not that one side wins. Which side wins is a genuine race and both answers
 * are legal. What must hold is that the **settled database** never shows a
 * combination that is incoherent — a paid order that was cancelled, stock
 * committed against an unverified payment, a consumed reservation on an order
 * still asking to be paid — and that whichever writer lost refused cleanly,
 * writing nothing.
 *
 * The forbidden combinations are asserted as a **census over every order the
 * suite created**, not case by case, so an ordering that never occurred in a
 * run still cannot hide a state that would be invalid if it did.
 *
 * ## Why no "both orderings occurred" assertion
 *
 * Deliberately absent, because a distribution is not a guarantee and a gate
 * that fails when a scheduler happens to favour one side is a gate nobody
 * trusts. Both orderings are proved **deterministically** instead, by the
 * sequential cases in this file and its two siblings — a sweep run after a
 * committed verification (verify-first), a verification attempted after a
 * committed sweep (expiry-first), a fee edit after a committed verification
 * and a verification of an attempt a committed fee edit superseded. What the
 * concurrent cases add is the thing sequencing cannot show: that no *third*
 * world exists when the two actually interleave.
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
  ledgerOf,
  reservationsOf,
  stockOf,
  verifyAttempt,
} from '../support/ready-made-fulfillment-fixture';
import {
  startWorkerExpiryProcess,
  type WorkerExpiryProcess,
} from '../support/worker-expiry-process';

interface OpenedAttempt {
  readonly attemptId: string;
  readonly amount: string;
  readonly transferReference: string;
}

describe('APP12-B05 — FULL verification against the writers that race it', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;
  let sweep: WorkerExpiryProcess;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b05_race');
    await publishSecureAccessPolicies(context.app, context.database);
    cookie = await seedAdminSession(context);
    sweep = await startWorkerExpiryProcess(context);
  }, 300_000);

  afterAll(async () => {
    await sweep?.close();
    await context?.close();
  });

  const db = () => context.database.client.db;

  const setFee = (orderId: string, feeAmount: string) =>
    request(serverOf(context))
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount }));

  /** Makes the order's reservation due, by the database's own clock. */
  const makeDue = async (orderId: string, secondsAgo: number): Promise<void> => {
    await db().execute(sql`
      update inventory_reservations
         set expires_at = now() - make_interval(secs => ${secondsAgo})
       where order_id = ${orderId}
    `);
  };

  /** One order carried by real routes to "an eligible FULL attempt exists". */
  async function payableAttempt(label: string) {
    const order = await createReadyMadeOrder(context, {
      label,
      unitPrice: 250_000,
      quantity: 1,
      quantityOnHand: 10,
    });
    const { token } = await adoptOrderAccessToken(context, order.orderId);
    await setFee(order.orderId, '30000').expect(200);
    await seedStepUp(context, order.fixture.customerId);
    const attempt = dataOf<OpenedAttempt>(
      await request(serverOf(context))
        .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
        .set('Idempotency-Key', `b05-race-${label}`)
        .send({ token })
        .expect(201),
    );
    return { ...order, token, attempt };
  }

  const verify = (attempt: OpenedAttempt) =>
    verifyAttempt(context, cookie, attempt.attemptId, {
      observedAmount: attempt.amount,
      observedTransferReference: attempt.transferReference,
    });

  /**
   * The census §13 forbids, taken over the whole settled database.
   *
   * Each row is a combination that cannot be true of any Ready-Made order at
   * any time, whichever writer won.
   */
  async function forbiddenCombinations(): Promise<Record<string, number>> {
    const { rows } = await db().execute<Record<string, string>>(sql`
      select
        (select count(*) from orders o
          join payment_obligations p on p.order_id = o.id and p.kind = 'FULL'
         where o.origin = 'READY_MADE' and o.status = 'CANCELLED'
           and p.status = 'SATISFIED')::text as satisfied_but_cancelled,
        (select count(*) from orders o
          join payment_obligations p on p.order_id = o.id and p.kind = 'FULL'
          join inventory_reservations r on r.order_id = o.id
         where o.origin = 'READY_MADE' and p.status = 'SATISFIED'
           and r.status = 'EXPIRED')::text as satisfied_but_expired,
        (select count(*) from orders o
          join inventory_reservations r on r.order_id = o.id
         where o.origin = 'READY_MADE' and o.status = 'READY_FOR_DELIVERY'
           and r.status = 'EXPIRED')::text as delivered_but_expired,
        (select count(*) from orders o
          join inventory_reservations r on r.order_id = o.id
         where o.origin = 'READY_MADE' and r.status = 'CONSUMED'
           and o.status in ('AWAITING_SHIPPING_FEE', 'AWAITING_PAYMENT', 'CANCELLED'))::text
             as consumed_but_unpaid,
        (select count(*) from orders o
          join payment_obligations p on p.order_id = o.id and p.kind = 'FULL'
          join inventory_reservations r on r.order_id = o.id
         where o.origin = 'READY_MADE' and r.status = 'CONSUMED'
           and p.status <> 'SATISFIED')::text as consumed_without_satisfaction,
        (select count(*) from orders o
         where o.origin = 'READY_MADE' and o.status = 'READY_FOR_DELIVERY'
           and not exists (select 1 from payment_obligations p
                            where p.order_id = o.id and p.kind = 'FULL'
                              and p.status = 'SATISFIED'))::text as delivered_without_payment
    `);
    const row = rows[0] ?? {};
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
  }

  const NOTHING_FORBIDDEN = {
    satisfied_but_cancelled: 0,
    satisfied_but_expired: 0,
    delivered_but_expired: 0,
    consumed_but_unpaid: 0,
    consumed_without_satisfaction: 0,
    delivered_without_payment: 0,
  };

  /** §13 — verification against the real reservation-expiry sweep. */
  describe('verification versus the real expiry sweep', () => {
    const outcomes: { orderId: string; skuId: string; status: number }[] = [];

    beforeAll(async () => {
      // Four attempts: two with no stagger at all, two with the sweep held back
      // by a few milliseconds. Neither actor is ever run to completion alone.
      for (const [attempt, sweepDelayMs] of [
        [1, 0],
        [2, 0],
        [3, 30],
        [4, 60],
      ] as const) {
        const order = await payableAttempt(`expiry-${String(attempt)}`);
        await makeDue(order.orderId, 60);

        const pass =
          sweepDelayMs === 0
            ? sweep.runPass()
            : new Promise<void>((resolve) => setTimeout(resolve, sweepDelayMs)).then(() =>
                sweep.runPass(),
              );
        const [, decision] = await Promise.all([pass, verify(order.attempt)]);
        outcomes.push({
          orderId: order.orderId,
          skuId: order.fixture.skuId,
          status: decision.status,
        });
      }
    }, 300_000);

    it('settles every attempt on one of the two legal worlds', async () => {
      for (const outcome of outcomes) {
        const order = await orderOf(context, outcome.orderId);
        const reservation = await reservationOf(context, outcome.orderId);
        const obligations = await obligationsOf(context, outcome.orderId);
        const full = obligations.find((row) => row.kind === 'FULL');

        if (outcome.status === 200) {
          // Verification won. The order is paid and dispatchable, and the stock
          // it was holding is now sold rather than lapsed.
          expect(order.status).toBe('READY_FOR_DELIVERY');
          expect(full?.status).toBe('SATISFIED');
          expect(reservation.status).toBe('CONSUMED');
        } else {
          // Expiry won. Every part of the order closed together, and the
          // verification wrote nothing at all.
          expect(outcome.status).toBe(409);
          expect(order.status).toBe('CANCELLED');
          expect(full?.status).toBe('CANCELLED');
          expect(reservation.status).toBe('EXPIRED');
          expect(
            (await ledgerOf(context, outcome.orderId)).filter(
              (row) => row.entry_kind === 'CONSUMED',
            ),
          ).toHaveLength(0);
        }
      }
    });

    it('commits the stock exactly once, and only where payment succeeded', async () => {
      for (const outcome of outcomes) {
        const consumed = (await ledgerOf(context, outcome.orderId)).filter(
          (row) => row.entry_kind === 'CONSUMED',
        );
        expect(consumed).toHaveLength(outcome.status === 200 ? 1 : 0);
        // Whichever way it went, the order still holds exactly the one
        // reservation `APP12-B02` created for it.
        expect(await reservationsOf(context, outcome.orderId)).toHaveLength(1);
        // Ten on hand, one unit either sold or returned to the shelf, and
        // nothing standing against it either way.
        const stock = await stockOf(context, outcome.skuId);
        expect(stock.reserved).toBe(0);
        expect(stock.onHand).toBe(outcome.status === 200 ? 9 : 10);
      }
    });

    it('makes a later sweep skip an order whose payment was verified', async () => {
      const order = await payableAttempt('verified-then-swept');
      await verify(order.attempt).expect(200);
      // §19 — the reservation is terminal, so the deadline is not a deadline any
      // more. Making it *due* is the sharpest form of the question: a sweep that
      // keyed on the timestamp alone would cancel a paid order here.
      await makeDue(order.orderId, 600);

      const before = await stockOf(context, order.fixture.skuId);
      await sweep.runPass();

      expect((await orderOf(context, order.orderId)).status).toBe('READY_FOR_DELIVERY');
      expect((await reservationOf(context, order.orderId)).status).toBe('CONSUMED');
      expect(await stockOf(context, order.fixture.skuId)).toEqual(before);
      expect(
        (await ledgerOf(context, order.orderId)).filter((row) => row.entry_kind === 'CONSUMED'),
      ).toHaveLength(1);
    });

    it('refuses to verify an attempt on an order expiry already cancelled', async () => {
      const order = await payableAttempt('expired-then-verified');
      await makeDue(order.orderId, 600);
      expect((await sweep.runPass()).expired).toBeGreaterThanOrEqual(1);

      // §43 — no resurrection. The customer's money is a refund question, not a
      // reason to revive an order whose stock went back on the shelf.
      await verify(order.attempt).expect(409);
      expect((await orderOf(context, order.orderId)).status).toBe('CANCELLED');
      expect((await reservationOf(context, order.orderId)).status).toBe('EXPIRED');
      expect(
        (await obligationsOf(context, order.orderId)).find((row) => row.kind === 'FULL')?.status,
      ).toBe('CANCELLED');
      expect(await stockOf(context, order.fixture.skuId)).toEqual({
        onHand: 10,
        reserved: 0,
        available: 10,
      });

      // §46 — and the customer is told *why*, from the committed fact rather
      // than from prose.
      const read = dataOf<{ status: string; terminationReason?: string }>(
        await request(serverOf(context))
          .post(ORDER_READ_ROUTE)
          .send({ token: order.token })
          .expect(200),
      );
      expect(read.status).toBe('CANCELLED');
      expect(read.terminationReason).toBe('RESERVATION_EXPIRED');
    });
  });

  /** §14 — verification against a concurrent shipping-fee correction. */
  describe('verification versus a fee correction', () => {
    const outcomes: { orderId: string; skuId: string; verified: boolean; feeSaved: boolean }[] = [];

    beforeAll(async () => {
      for (const attempt of [1, 2, 3, 4] as const) {
        const order = await payableAttempt(`fee-${String(attempt)}`);
        const [decision, saved] = await Promise.all([
          verify(order.attempt),
          setFee(order.orderId, '45000'),
        ]);
        outcomes.push({
          orderId: order.orderId,
          skuId: order.fixture.skuId,
          verified: decision.status === 200,
          feeSaved: saved.status === 200,
        });
      }
    }, 300_000);

    it('never lets both writers win', () => {
      // Two live obligations, or a consumed reservation on an order still
      // payable, are what "both won" would look like. Exactly one side commits.
      for (const outcome of outcomes) {
        expect(outcome.verified).not.toBe(outcome.feeSaved);
      }
    });

    it('settles every attempt on one of the two legal worlds', async () => {
      for (const outcome of outcomes) {
        const order = await orderOf(context, outcome.orderId);
        const obligations = await obligationsOf(context, outcome.orderId);
        const reservation = await reservationOf(context, outcome.orderId);

        if (outcome.verified) {
          // The payment landed first, so the correction had nothing left to
          // supersede and was refused: one obligation, satisfied.
          expect(order.status).toBe('READY_FOR_DELIVERY');
          expect(obligations).toHaveLength(1);
          expect(obligations[0]).toMatchObject({ kind: 'FULL', status: 'SATISFIED' });
          expect(reservation.status).toBe('CONSUMED');
        } else {
          // The correction landed first, so the attempt belonged to a
          // superseded obligation and the verification refused: the order is
          // still payable, at the new price, on the same reservation.
          expect(order.status).toBe('AWAITING_PAYMENT');
          expect(obligations.map((row) => row.status)).toEqual(['SUPERSEDED', 'PENDING']);
          expect(reservation.status).toBe('RESERVED');
          expect(
            (await ledgerOf(context, outcome.orderId)).filter(
              (row) => row.entry_kind === 'CONSUMED',
            ),
          ).toHaveLength(0);
        }
      }
    });

    it('never leaves two live obligations on one order', async () => {
      const { rows } = await db().execute<{ count: string }>(sql`
        select count(*)::text as count from (
          select order_id from payment_obligations
           where kind = 'FULL' and status = 'PENDING'
           group by order_id having count(*) > 1
        ) as offenders
      `);
      expect(Number(rows[0]?.count ?? '0')).toBe(0);
    });
  });

  /** The census, over everything every case above created. */
  it('leaves no forbidden combination anywhere in the settled database', async () => {
    expect(await forbiddenCombinations()).toEqual(NOTHING_FORBIDDEN);
  });
});
