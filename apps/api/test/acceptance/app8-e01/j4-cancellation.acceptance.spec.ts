/**
 * `APP8-E01` journey **J4** — the production-cancellation boundary.
 *
 * The question this journey exists to answer is not "can a job be cancelled" —
 * `APP8-B04` proved that — but **where APP8's cancellation stops**. Cancelling a
 * production job is a shop-floor decision. It is not the commercial
 * cancellation of the customer's order, it triggers no refund, and it moves the
 * order not at all. A single case that cancels and then inspects everything the
 * cancellation must *not* have touched is the whole boundary.
 *
 * Its own fixture, so `J3`'s successful completion stays intact.
 *
 * `E01-14` — the Admin cancellation dialog's copy and reason requirement — is
 * the Admin-workspace half of this journey and lives in
 * `apps/admin/test/acceptance`.
 *
 * The `STARTED` cancellation (consumed stock is not un-consumed) and the blank
 * reason refusal are accepted `APP8-B04` evidence and are not re-proved here.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  CATALOG_QUANTITY,
  createApp8AcceptanceContext,
  dataOf,
  ROUTES,
  type App8AcceptanceContext,
  type SeededOrder,
} from './app8-e01-context';

interface CreatedPayload {
  readonly jobId: string;
}

interface TransitionPayload {
  readonly jobId: string;
  readonly fromStatus: string;
  readonly status: string;
  readonly orderStatus: string;
  readonly reservationIds: readonly string[];
}

interface DetailPayload {
  readonly status: string;
  readonly cancelledAt?: string;
  readonly cancelledReason?: string;
  readonly transitions: readonly { readonly toStatus: string; readonly reason?: string }[];
  readonly reservationSummary?: {
    readonly reservations: readonly { readonly status: string }[];
  };
}

const OPENING_COUNT = 60;
const OPENING_REASON = 'Nhập kho';
const CANCELLATION_REASON = 'Máy thêu hỏng, chuyển đơn sang xưởng khác';

describe('APP8-E01 J4 — the production-cancellation boundary', () => {
  let context: App8AcceptanceContext;
  let order: SeededOrder;
  let skuId: string;
  let jobId: string;
  let reservationId: string;

  beforeAll(async () => {
    context = await createApp8AcceptanceContext('app8-e01-j4');
    await context.reset();
    order = await context.seedCatalogOrder('e01-j4');
    skuId = order.fixture.skuId;
    await context.seedAdminSession();

    await request(context.server())
      .get(ROUTES.stock(skuId))
      .set('Cookie', context.adminCookie())
      .expect(200);
    await request(context.server())
      .post(ROUTES.adjust(skuId))
      .set('Cookie', context.adminCookie())
      .send({ delta: OPENING_COUNT, reason: OPENING_REASON })
      .expect(200);

    reservationId = await context.reserveAsWorker(order.orderId, skuId, CATALOG_QUANTITY);

    const created = dataOf<CreatedPayload>(
      await request(context.server())
        .post(ROUTES.create(order.orderId))
        .set('Cookie', context.adminCookie())
        .send({})
        .expect(201),
    );
    jobId = created.jobId;
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  // ---------------------------------------------------------------------------
  // E01-13 — cancel a PLANNED Catalog job, and leave the commercial order alone.
  // ---------------------------------------------------------------------------
  it('E01-13 — cancels the job, releases the reservation, and moves no order', async () => {
    const orderTransitionsBefore = await context.countRows('order_transitions');
    const outboxBefore = await context.countRows('outbox_events');

    const result = dataOf<TransitionPayload>(
      await request(context.server())
        .post(ROUTES.transition(jobId))
        .set('Cookie', context.adminCookie())
        .send({ to: 'CANCELLED', reason: CANCELLATION_REASON })
        .expect(200),
    );

    expect(result.fromStatus).toBe('PLANNED');
    expect(result.status).toBe('CANCELLED');
    expect(result.reservationIds).toEqual([reservationId]);
    // The order's own status, echoed back unchanged.
    expect(result.orderStatus).toBe('DEPOSIT_PAID');

    // --- what the cancellation DID do -------------------------------------
    const [job] = (
      await context.disposable.client.db.execute<{ status: string; cancelled_reason: string }>(
        sql`select status, cancelled_reason from production_jobs where id = ${jobId}`,
      )
    ).rows;
    expect(job?.status).toBe('CANCELLED');
    expect(job?.cancelled_reason).toBe(CANCELLATION_REASON);

    const reservations = await context.reservationsOf(order.orderId);
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.status).toBe('RELEASED');
    // The operator's words, preserved on the reservation that was let go.
    expect(reservations[0]?.releasedReason).toBe(CANCELLATION_REASON);

    // Exactly one release ledger entry, and it is not a goods movement: the
    // units were never issued, so on-hand is untouched in both directions.
    expect(await context.ledgerOf(skuId)).toEqual([
      {
        entryKind: 'ADJUSTMENT',
        quantity: OPENING_COUNT,
        onHandDelta: OPENING_COUNT,
        reason: OPENING_REASON,
      },
      { entryKind: 'RESERVED', quantity: CATALOG_QUANTITY, onHandDelta: 0, reason: null },
      {
        entryKind: 'RESERVATION_RELEASED',
        quantity: CATALOG_QUANTITY,
        onHandDelta: 0,
        reason: CANCELLATION_REASON,
      },
    ]);
    await expect(context.onHand(skuId)).resolves.toBe(OPENING_COUNT);

    await expect(context.countRows('production_job_transitions')).resolves.toBe(1);
    await expect(context.auditActions()).resolves.toEqual([
      'sku_stock.adjusted',
      'production_job.cancelled',
    ]);

    // --- what the cancellation did NOT do ---------------------------------
    // The commercial order is exactly where it was. APP8 owns the job move and
    // the release; the order cancellation/refund saga is not APP8's.
    await expect(context.orderStatusOf(order.orderId)).resolves.toBe('DEPOSIT_PAID');
    await expect(context.countRows('order_transitions')).resolves.toBe(orderTransitionsBefore);

    // No side effect is announced: no accepted event names a production-job
    // cancellation, so none is emitted and no downstream saga can be woken.
    await expect(context.countRows('outbox_events')).resolves.toBe(outboxBefore);

    // The deposit stands. Nothing was refunded, reversed or re-opened.
    const obligations = (
      await context.disposable.client.db.execute<{ kind: string; status: string }>(
        sql`select kind, status from payment_obligations where order_id = ${order.orderId}`,
      )
    ).rows;
    expect(obligations).toEqual([{ kind: 'DEPOSIT', status: 'SATISFIED' }]);

    // The detail reports the cancellation as a production-job fact, carrying
    // the reason, with the reservation shown as released rather than consumed.
    const view = dataOf<DetailPayload>(
      await request(context.server())
        .get(ROUTES.detail(jobId))
        .set('Cookie', context.adminCookie())
        .expect(200),
    );
    expect(view.status).toBe('CANCELLED');
    expect(view.cancelledAt).toEqual(expect.any(String));
    expect(view.cancelledReason).toBe(CANCELLATION_REASON);
    expect(view.transitions).toHaveLength(1);
    expect(view.transitions[0]?.toStatus).toBe('CANCELLED');
    expect(view.transitions[0]?.reason).toBe(CANCELLATION_REASON);
    expect(view.reservationSummary?.reservations[0]?.status).toBe('RELEASED');
  });
});
