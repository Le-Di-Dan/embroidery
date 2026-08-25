/**
 * `APP8-B04` §21.4 — the targeted concurrency proof for the new cross-aggregate
 * lock order.
 *
 * One race, the preferred one: **production start versus an order hold.** It is
 * the pair the new lock order exists to arbitrate — the order row is step (1)
 * precisely so a hold and a start cannot both believe they saw a `DEPOSIT_PAID`
 * order — and the hold is driven through the delivered `OrderRepository`
 * transition rather than a raw `UPDATE`, so what races the start is the real
 * order authority.
 *
 * ### Sequenced by the lock, not by timing
 *
 * There is no `sleep` and no retry loop. The holder takes the order row lock and
 * signals; the start request is fired and then **observed blocked on a PostgreSQL
 * lock** through `pg_stat_activity`, which is PostgreSQL's own answer to "is that
 * transaction waiting?"; only then does the holder commit its hold. That is the
 * same convention `APP8-B02`'s CC-21 races use, and it is what makes this a
 * proof rather than a coincidence: under an implementation that read the order's
 * status without locking, the start would never have waited and
 * `waitForLockWaiter` would fail instead of the assertions.
 *
 * The two transactions come from two different pools — the holder from the test
 * harness's `TransactionManager`, the start from the running HTTP application —
 * so they are genuinely independent connections.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import { Barrier } from '../../../../tests/integration/db8-barrier';
import {
  createAdminProductionContext,
  dataOf,
  ROUTES,
  type AdminProductionTestContext,
} from './admin-production-context';

interface CreatedPayload {
  readonly jobId: string;
}

const CATALOG_QUANTITY = 25;
const ON_HAND = 100;
const HOLD_REASON = 'Khách yêu cầu tạm dừng để đổi màu chỉ';

describe('APP8-B04 — production transition races (integration)', () => {
  let context: AdminProductionTestContext;

  beforeAll(async () => {
    context = await createAdminProductionContext('app8-b04-races');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  /**
   * Resolves once some backend on this database is waiting on a lock.
   *
   * The condition, not a duration. Bounded, so an implementation that stopped
   * taking the order row lock fails here rather than hanging.
   */
  async function waitForLockWaiter(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const [row] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock'`,
        )
      ).rows;
      if (Number(row?.count ?? '0') > 0) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `No backend blocked on a lock within ${timeoutMs}ms — the start never waited on the ` +
            'order row, so the order lock is not the arbiter between production start and an ' +
            'order hold (APP8-B04 §8, §15.2).',
        );
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  it('serialises a start behind an order hold, and then refuses it without consuming', async () => {
    const order = await context.seedOrder();
    const skuId = order.fixture.skuId;
    await context.seedStock(skuId, ON_HAND);
    await context.seedReservation(order.orderId, skuId, CATALOG_QUANTITY);
    await context.moveOrder(order.orderId, 'DEPOSIT_PAID');
    const created = dataOf<CreatedPayload>(
      await request(context.server())
        .post(ROUTES.create(order.orderId))
        .set('Cookie', context.adminCookie())
        .send({})
        .expect(201),
    );

    const barrier = new Barrier();

    // The hold: it takes the order row lock first and holds the transaction
    // open until the start is provably waiting behind it.
    const holder = context.inTransaction(async () => {
      await context.orderWriter().loadForUpdate(order.orderId as never);
      barrier.signal('hold-owns-the-order-row');
      await barrier.waitFor('start-is-blocked');
      await context.orderWriter().transition({
        id: order.orderId as never,
        to: 'ON_HOLD',
        actor: { kind: 'ADMIN', adminId: order.fixture.adminId },
        reason: HOLD_REASON,
        correlationId: created.jobId,
      });
    });

    await barrier.waitFor('hold-owns-the-order-row');

    const startResponse = request(context.server())
      .post(ROUTES.transition(created.jobId))
      .set('Cookie', context.adminCookie())
      .send({ to: 'STARTED' });
    const settled = startResponse.then((response) => response);

    // The start has reached the order row and is waiting for the hold's lock.
    await waitForLockWaiter();
    barrier.signal('start-is-blocked');
    await holder;

    const response = await settled;

    // It woke, re-read the *committed* hold under its own lock, and refused.
    expect(response.status).toBe(409);
    expect((response.body as { code?: string }).code).toBe('PRODUCTION_ORDER_ON_HOLD');

    // And terminalized nothing on its way there — no partial job, order or
    // inventory effect anywhere.
    expect((await context.reservationsOf(order.orderId))[0]?.status).toBe('RESERVED');
    await expect(context.onHand(skuId)).resolves.toBe(ON_HAND);
    await expect(context.ledgerKindsOf(skuId)).resolves.toEqual(['RESERVED']);
    await expect(context.countRows('production_job_transitions')).resolves.toBe(0);

    const held = await context.inTransaction(() =>
      context.orderWriter().findById(order.orderId as never),
    );
    expect(held?.status).toBe('ON_HOLD');
  }, 60_000);
});
