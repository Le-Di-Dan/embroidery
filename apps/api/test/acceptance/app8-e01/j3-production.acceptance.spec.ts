/**
 * `APP8-E01` journey **J3** — production create -> start -> complete.
 *
 * One order, carried the whole way. The cases are deliberately **ordered and
 * cumulative**: `E01-07` creates the job the queue in `E01-08` must show, the
 * detail in `E01-09` must describe, the start in `E01-10` must commit and the
 * completion in `E01-12` must terminate. Nothing is re-seeded between them, so
 * a case that passes against state its predecessor did not really produce
 * cannot exist.
 *
 * The stock this journey consumes is established through the delivered
 * `APP8-B01` Admin adjustment route — the same operation `J1` proves — and the
 * official reservation is created through the canonical AGG-07 writer with the
 * `inventory.reserve` SYSTEM actor, which is the exact call `APP8-W01`'s
 * handler makes and `J2` proves the worker reaches. `apps/api` may not import
 * `apps/worker`, so the two halves meet at that writer rather than in one
 * process.
 *
 * `E01-11` — the Admin detail's refresh to started truth — is the
 * Admin-workspace half of this journey and lives in
 * `apps/admin/test/acceptance`.
 *
 * Not re-proved here (accepted, unchanged): every `B03` create refusal and
 * queue filter, every `B04` transition permutation, the start-vs-hold
 * concurrency arbiter and the multi-SKU late rollback.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  CATALOG_QUANTITY,
  createApp8AcceptanceContext,
  dataOf,
  FROZEN_PRODUCT_NAME,
  FROZEN_VARIANT_LABEL,
  ROUTES,
  type App8AcceptanceContext,
  type SeededOrder,
} from './app8-e01-context';

interface CreatedPayload {
  readonly jobId: string;
  readonly orderId: string;
  readonly approvalSnapshotId: string;
  readonly status: string;
}

interface QueuePayload {
  readonly items: readonly {
    readonly jobId: string;
    readonly orderId: string;
    readonly approvalSnapshotId: string;
    readonly status: string;
    readonly createdAt: string;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly cancelledAt?: string;
  }[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

interface DetailPayload {
  readonly jobId: string;
  readonly orderId: string;
  readonly orderCode: string;
  readonly approvalSnapshotId: string;
  readonly status: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly specification?: {
    readonly approvalSnapshotId: string;
    readonly documentHash: string;
    readonly productName: string;
    readonly variantLabel?: string;
    readonly sideName: string;
    readonly areaName: string;
    readonly quantityTotal: number;
  };
  readonly transitions: readonly {
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly actorKind: string;
    readonly reason?: string;
  }[];
  readonly reservationSummary?: {
    readonly required: boolean;
    readonly catalogItemCount: number;
    readonly customerOwnedItemCount: number;
    readonly reservations: readonly {
      readonly reservationId: string;
      readonly skuId: string;
      readonly quantity: number;
      readonly status: string;
    }[];
  };
}

interface TransitionPayload {
  readonly jobId: string;
  readonly fromStatus: string;
  readonly status: string;
  readonly orderStatus: string;
  readonly reservationIds: readonly string[];
}

const OPENING_COUNT = 100;

describe('APP8-E01 J3 — production create, start and complete', () => {
  let context: App8AcceptanceContext;
  let order: SeededOrder;
  let skuId: string;
  let jobId: string;
  let reservationId: string;

  beforeAll(async () => {
    context = await createApp8AcceptanceContext('app8-e01-j3');
    await context.reset();
    order = await context.seedCatalogOrder('e01-j3');
    skuId = order.fixture.skuId;
    await context.seedAdminSession();

    // Stock enters the system exactly one way: the delivered Admin adjustment
    // route (J1's `E01-02`). The anchor read comes first because that is what
    // an operator does, and it is what creates the row the adjustment locks.
    await request(context.server())
      .get(ROUTES.stock(skuId))
      .set('Cookie', context.adminCookie())
      .expect(200);
    await request(context.server())
      .post(ROUTES.adjust(skuId))
      .set('Cookie', context.adminCookie())
      .send({ delta: OPENING_COUNT, reason: 'Nhập kho cho đơn sản xuất' })
      .expect(200);

    // The official reservation, through the canonical AGG-07 writer with the
    // `inventory.reserve` SYSTEM actor — see the file header.
    reservationId = await context.reserveAsWorker(order.orderId, skuId, CATALOG_QUANTITY);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  const create = () =>
    request(context.server())
      .post(ROUTES.create(order.orderId))
      .set('Cookie', context.adminCookie())
      .send({});

  const queue = (query: Record<string, string> = {}) =>
    request(context.server()).get(ROUTES.queue()).query(query).set('Cookie', context.adminCookie());

  const detail = () =>
    request(context.server()).get(ROUTES.detail(jobId)).set('Cookie', context.adminCookie());

  const move = (body: Record<string, unknown>) =>
    request(context.server())
      .post(ROUTES.transition(jobId))
      .set('Cookie', context.adminCookie())
      .send(body);

  // ---------------------------------------------------------------------------
  // E01-07 — the job is cut from the order's own approval, and consumes nothing.
  // ---------------------------------------------------------------------------
  it('E01-07 — creates a PLANNED job with one specification frozen from the approval', async () => {
    const onHandBefore = await context.onHand(skuId);
    const ledgerBefore = await context.ledgerOf(skuId);

    const created = dataOf<CreatedPayload>(await create().expect(201));
    jobId = created.jobId;

    expect(created.orderId).toBe(order.orderId);
    expect(created.status).toBe('PLANNED');
    // The exact Approval Snapshot the order points at — never a live read.
    expect(created.approvalSnapshotId).toBe(order.approvalSnapshotId);

    await expect(context.countRows('production_jobs')).resolves.toBe(1);
    await expect(context.countRows('production_specifications')).resolves.toBe(1);

    const [job] = (
      await context.disposable.client.db.execute<{
        status: string;
        approval_snapshot_id: string;
        order_id: string;
      }>(sql`select status, approval_snapshot_id, order_id from production_jobs`)
    ).rows;
    expect(job?.status).toBe('PLANNED');
    expect(job?.approval_snapshot_id).toBe(order.approvalSnapshotId);
    expect(job?.order_id).toBe(order.orderId);

    // Creation is not a goods issue: nothing moved on the shelf, the
    // reservation is untouched, and the order has not been advanced.
    await expect(context.onHand(skuId)).resolves.toBe(onHandBefore);
    await expect(context.ledgerOf(skuId)).resolves.toEqual(ledgerBefore);
    expect((await context.reservationsOf(order.orderId))[0]?.status).toBe('RESERVED');
    await expect(context.orderStatusOf(order.orderId)).resolves.toBe('DEPOSIT_PAID');
    await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
  });

  // ---------------------------------------------------------------------------
  // E01-08 — the queue shows the job the create route just produced.
  // ---------------------------------------------------------------------------
  it('E01-08 — shows the new job in the Admin production queue with truthful fields', async () => {
    const page = dataOf<QueuePayload>(await queue().expect(200));

    expect(page.items).toHaveLength(1);
    const [item] = page.items;
    expect(item?.jobId).toBe(jobId);
    expect(item?.orderId).toBe(order.orderId);
    expect(item?.approvalSnapshotId).toBe(order.approvalSnapshotId);
    expect(item?.status).toBe('PLANNED');
    expect(item?.createdAt).toEqual(expect.any(String));
    // A PLANNED job has reached no later moment, and the queue does not invent
    // one.
    expect(item?.startedAt).toBeUndefined();
    expect(item?.completedAt).toBeUndefined();
    expect(item?.cancelledAt).toBeUndefined();

    // Keyset paging, not page numbers: one item exhausts the page.
    expect(page.hasNext).toBe(false);
    expect(page.nextCursor).toBeUndefined();

    // The published LC-18 status filter selects it, and a disjoint selection
    // does not — the queue is reading status, not echoing the request.
    const planned = dataOf<QueuePayload>(await queue({ status: 'PLANNED' }).expect(200));
    expect(planned.items.map((row) => row.jobId)).toEqual([jobId]);
    const completed = dataOf<QueuePayload>(await queue({ status: 'COMPLETED' }).expect(200));
    expect(completed.items).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // E01-09 — the detail describes frozen truth, and invents no history.
  // ---------------------------------------------------------------------------
  it('E01-09 — reports the frozen specification and truthful reservation context', async () => {
    const view = dataOf<DetailPayload>(await detail().expect(200));

    expect(view.jobId).toBe(jobId);
    expect(view.orderId).toBe(order.orderId);
    expect(view.orderCode).toBe(order.code);
    expect(view.status).toBe('PLANNED');
    expect(view.startedAt).toBeUndefined();
    expect(view.completedAt).toBeUndefined();

    // The specification is the approval's, frozen at creation.
    expect(view.specification).toBeDefined();
    expect(view.specification?.approvalSnapshotId).toBe(order.approvalSnapshotId);
    expect(view.specification?.productName).toBe(FROZEN_PRODUCT_NAME);
    expect(view.specification?.variantLabel).toBe(FROZEN_VARIANT_LABEL);
    expect(view.specification?.quantityTotal).toBe(CATALOG_QUANTITY);
    expect(view.specification?.documentHash).toEqual(expect.any(String));

    // The reservation context is the committed inventory truth for this order.
    expect(view.reservationSummary?.required).toBe(true);
    expect(view.reservationSummary?.catalogItemCount).toBe(1);
    expect(view.reservationSummary?.customerOwnedItemCount).toBe(0);
    const summarised = view.reservationSummary?.reservations ?? [];
    expect(summarised).toHaveLength(1);
    expect(summarised[0]?.reservationId).toBe(reservationId);
    expect(summarised[0]?.skuId).toBe(skuId);
    expect(summarised[0]?.quantity).toBe(CATALOG_QUANTITY);
    expect(summarised[0]?.status).toBe('RESERVED');

    // No creation row is invented: LC-18 has no transition into PLANNED, and
    // the history is the transitions that actually happened, which is none.
    expect(view.transitions).toEqual([]);
    await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
  });

  // ---------------------------------------------------------------------------
  // E01-10 — the whole combined effect, committed once.
  // ---------------------------------------------------------------------------
  it('E01-10 — starts production, committing job, order, reservation and stock together', async () => {
    const outboxBefore = await context.countRows('outbox_events');
    const auditBefore = await context.countRows('audit_events');

    const result = dataOf<TransitionPayload>(await move({ to: 'STARTED' }).expect(200));

    expect(result.jobId).toBe(jobId);
    expect(result.fromStatus).toBe('PLANNED');
    expect(result.status).toBe('STARTED');
    expect(result.orderStatus).toBe('IN_PRODUCTION');
    expect(result.reservationIds).toEqual([reservationId]);

    // Committed truth, read back outside the request that wrote it.
    await expect(context.orderStatusOf(order.orderId)).resolves.toBe('IN_PRODUCTION');

    const reservations = await context.reservationsOf(order.orderId);
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.status).toBe('CONSUMED');
    expect(reservations[0]?.quantity).toBe(CATALOG_QUANTITY);

    // The goods issue: on hand down by exactly the reserved quantity, once.
    await expect(context.onHand(skuId)).resolves.toBe(OPENING_COUNT - CATALOG_QUANTITY);
    expect(await context.ledgerOf(skuId)).toEqual([
      {
        entryKind: 'ADJUSTMENT',
        quantity: OPENING_COUNT,
        onHandDelta: OPENING_COUNT,
        reason: 'Nhập kho cho đơn sản xuất',
      },
      { entryKind: 'RESERVED', quantity: CATALOG_QUANTITY, onHandDelta: 0, reason: null },
      {
        entryKind: 'CONSUMED',
        quantity: CATALOG_QUANTITY,
        onHandDelta: -CATALOG_QUANTITY,
        reason: null,
      },
    ]);

    // Both histories gained exactly one row, and the accepted B04 side effects
    // are present exactly once.
    await expect(context.countRows('production_job_transitions')).resolves.toBe(1);
    await expect(context.countRows('audit_events')).resolves.toBe(auditBefore + 1);
    await expect(context.countRows('outbox_events')).resolves.toBe(outboxBefore + 1);

    const [event] = (
      await context.disposable.client.db.execute<{ event_type: string; aggregate_id: string }>(
        sql`select event_type, aggregate_id from outbox_events
             order by id desc limit 1`,
      )
    ).rows;
    expect(event?.event_type).toBe('production.started');
    expect(event?.aggregate_id).toBe(jobId);

    // The detail now reports started truth, with the one transition it made.
    const view = dataOf<DetailPayload>(await detail().expect(200));
    expect(view.status).toBe('STARTED');
    expect(view.startedAt).toEqual(expect.any(String));
    expect(view.transitions).toHaveLength(1);
    expect(view.transitions[0]?.fromStatus).toBe('PLANNED');
    expect(view.transitions[0]?.toStatus).toBe('STARTED');
    expect(view.transitions[0]?.actorKind).toBe('ADMIN');
    expect(view.reservationSummary?.reservations[0]?.status).toBe('CONSUMED');
  });

  // ---------------------------------------------------------------------------
  // E01-12 — the terminal successful handoff, and where APP8 stops.
  // ---------------------------------------------------------------------------
  it('E01-12 — completes production and stops before the APP9 remaining-payment move', async () => {
    const onHandBefore = await context.onHand(skuId);
    const ledgerBefore = await context.ledgerOf(skuId);

    const result = dataOf<TransitionPayload>(await move({ to: 'COMPLETED' }).expect(200));

    expect(result.fromStatus).toBe('STARTED');
    expect(result.status).toBe('COMPLETED');
    expect(result.orderStatus).toBe('PRODUCTION_COMPLETED');

    await expect(context.orderStatusOf(order.orderId)).resolves.toBe('PRODUCTION_COMPLETED');
    // APP8's exit gate, stated as the assertion it is: the phase does not
    // execute TR-LC14-05.
    expect(await context.orderStatusOf(order.orderId)).not.toBe('AWAITING_FINAL_PAYMENT');

    // Completion is not a goods movement — the stock left at start.
    await expect(context.onHand(skuId)).resolves.toBe(onHandBefore);
    await expect(context.ledgerOf(skuId)).resolves.toEqual(ledgerBefore);
    expect((await context.reservationsOf(order.orderId))[0]?.status).toBe('CONSUMED');

    // The REMAINING obligation APP7 created is still unsatisfied: APP8 collects
    // no payment.
    const obligations = (
      await context.disposable.client.db.execute<{ kind: string; status: string }>(
        sql`select kind, status from payment_obligations where order_id = ${order.orderId}`,
      )
    ).rows;
    expect(obligations.every((row) => row.kind !== 'REMAINING' || row.status !== 'SATISFIED')).toBe(
      true,
    );

    const view = dataOf<DetailPayload>(await detail().expect(200));
    expect(view.status).toBe('COMPLETED');
    expect(view.completedAt).toEqual(expect.any(String));
    expect(view.transitions.map((row) => row.toStatus)).toEqual(['STARTED', 'COMPLETED']);
  });
});
