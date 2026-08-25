/**
 * `APP8-B04` §21.1 / §21.2 — production start and completion, against a real
 * PostgreSQL instance and through the real HTTP route.
 *
 * Every case is stated as the property it protects. The whole point of this
 * checkpoint is that a start commits a job move, an order move and one or more
 * inventory terminalizations **together or not at all**, so the assertions are
 * about committed rows — `production_jobs`, `orders`, `inventory_reservations`,
 * `sku_stocks.quantity_on_hand`, both transition tables and the ledger — and not
 * about the response body alone. A response can be right while the database is
 * half-written; a row count cannot.
 */
import request from 'supertest';

import {
  createAdminProductionContext,
  dataOf,
  ROUTES,
  type AdminProductionTestContext,
  type SeededOrder,
} from './admin-production-context';
import {
  catalogItem,
  customerOwnedProductOf,
  releaseAllReservations,
  repointOrderApproval,
  unsatisfyDeposit,
} from './production-transition-support';

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

const CATALOG_QUANTITY = 25;
const ON_HAND = 100;

describe('APP8-B04 — production start and completion (integration)', () => {
  let context: AdminProductionTestContext;

  beforeAll(async () => {
    context = await createAdminProductionContext('app8-b04-start');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const create = (orderId: string) =>
    request(context.server())
      .post(ROUTES.create(orderId))
      .set('Cookie', context.adminCookie())
      .send({});

  const move = (jobId: string, body: Record<string, unknown>) =>
    request(context.server())
      .post(ROUTES.transition(jobId))
      .set('Cookie', context.adminCookie())
      .send(body);

  async function orderStatusOf(orderId: string): Promise<string> {
    const order = await context.inTransaction(() =>
      context.orderWriter().findById(orderId as never),
    );
    return order?.status ?? 'MISSING';
  }

  /**
   * A Catalog order at the exact moment `GRD-015` describes: deposit satisfied,
   * order `DEPOSIT_PAID`, one `RESERVED` reservation covering the frozen
   * quantity, one `PLANNED` job cut from the order's own approval.
   */
  async function startableCatalogOrder(): Promise<{
    readonly order: SeededOrder;
    readonly jobId: string;
    readonly skuId: string;
  }> {
    const order = await context.seedOrder();
    const skuId = order.fixture.skuId;
    await context.seedStock(skuId, ON_HAND);
    await context.seedReservation(order.orderId, skuId, CATALOG_QUANTITY);
    await context.moveOrder(order.orderId, 'DEPOSIT_PAID');
    const created = dataOf<CreatedPayload>(await create(order.orderId).expect(201));
    return { order, jobId: created.jobId, skuId };
  }

  // -------------------------------------------------------------------------
  // Case S1 — the whole combined effect, committed once.
  // -------------------------------------------------------------------------

  describe('case S1 — a Catalog order with full reservation coverage', () => {
    it('commits the job move, the order move and the goods issue together', async () => {
      const { order, jobId, skuId } = await startableCatalogOrder();

      const result = dataOf<TransitionPayload>(await move(jobId, { to: 'STARTED' }).expect(200));

      expect(result.fromStatus).toBe('PLANNED');
      expect(result.status).toBe('STARTED');
      expect(result.orderStatus).toBe('IN_PRODUCTION');
      expect(result.reservationIds).toHaveLength(1);

      await expect(orderStatusOf(order.orderId)).resolves.toBe('IN_PRODUCTION');

      const reservations = await context.reservationsOf(order.orderId);
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.status).toBe('CONSUMED');

      // Exactly once, by exactly the reserved quantity. A second decrement or a
      // decrement of the wrong amount both fail here.
      await expect(context.onHand(skuId)).resolves.toBe(ON_HAND - CATALOG_QUANTITY);

      // One `RESERVED` from the seed, one `CONSUMED` from the start — and no
      // `RESERVATION_RELEASED` beside it (the CC-21 double-terminalization).
      await expect(context.ledgerKindsOf(skuId)).resolves.toEqual(['RESERVED', 'CONSUMED']);

      // One move each side, and one audit row.
      await expect(context.countRows('production_job_transitions')).resolves.toBe(1);
      await expect(context.countRows('audit_events')).resolves.toBe(1);
    });

    it('emits the accepted SE-009 lifecycle event inside the same transaction', async () => {
      const { jobId } = await startableCatalogOrder();
      const before = await context.countRows('outbox_events');

      await move(jobId, { to: 'STARTED' }).expect(200);

      // `order.created` is already there from the seed, so the assertion is the
      // delta: exactly one new event, `production.started`.
      await expect(context.countRows('outbox_events')).resolves.toBe(before + 1);
    });
  });

  // -------------------------------------------------------------------------
  // Case S2 — COP-only: `PO-APP8-001` §1.3, the branch a literal reading of
  // GRD-015 would make permanently unreachable.
  // -------------------------------------------------------------------------

  describe('case S2 — a customer-owned-only order', () => {
    it('starts with no reservation at all, and fabricates no inventory identity', async () => {
      const fixture = await context.seedChain('b04-cop');
      const approvalSnapshotId = await context.seedCustomerOwnedApproval(fixture);
      const copProductId = await customerOwnedProductOf(context, approvalSnapshotId);
      const order = await context.seedOrder({
        fixture,
        approvalSnapshotId,
        items: [context.customerOwnedItem(copProductId)],
      });
      await context.moveOrder(order.orderId, 'DEPOSIT_PAID');
      const created = dataOf<CreatedPayload>(await create(order.orderId).expect(201));

      const result = dataOf<TransitionPayload>(
        await move(created.jobId, { to: 'STARTED' }).expect(200),
      );

      expect(result.status).toBe('STARTED');
      expect(result.orderStatus).toBe('IN_PRODUCTION');
      expect(result.reservationIds).toEqual([]);

      // Nothing was invented to have something to consume.
      await expect(context.countRows('inventory_reservations')).resolves.toBe(0);
      await expect(context.countRows('inventory_ledger_entries')).resolves.toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Case S3 — mixed: Catalog portions consume, COP portions contribute nothing.
  // -------------------------------------------------------------------------

  describe('case S3 — a mixed Catalog + customer-owned order', () => {
    it('consumes only the Catalog reservation and leaves the COP line untouched', async () => {
      const fixture = await context.seedChain('b04-mixed');
      const copApproval = await context.seedCustomerOwnedApproval(fixture);
      const copProductId = await customerOwnedProductOf(context, copApproval);
      const order = await context.seedOrder({
        fixture,
        items: [
          catalogItem(fixture, 1, CATALOG_QUANTITY),
          { ...context.customerOwnedItem(copProductId), position: 2 },
        ],
      });
      await context.seedStock(fixture.skuId, ON_HAND);
      await context.seedReservation(order.orderId, fixture.skuId, CATALOG_QUANTITY);
      await context.moveOrder(order.orderId, 'DEPOSIT_PAID');
      const created = dataOf<CreatedPayload>(await create(order.orderId).expect(201));

      const result = dataOf<TransitionPayload>(
        await move(created.jobId, { to: 'STARTED' }).expect(200),
      );

      expect(result.reservationIds).toHaveLength(1);
      await expect(context.countRows('inventory_reservations')).resolves.toBe(1);
      await expect(context.onHand(fixture.skuId)).resolves.toBe(ON_HAND - CATALOG_QUANTITY);
    });
  });

  // -------------------------------------------------------------------------
  // Cases S4, S5, S8 — the refusals that must terminalize nothing.
  // -------------------------------------------------------------------------

  describe('the start refusals', () => {
    /** Case S4 — GRD-013 through the one deposit authority. */
    it('refuses when the deposit obligation is not satisfied, changing nothing', async () => {
      const { order, jobId, skuId } = await startableCatalogOrder();
      // The obligation is walked back to PENDING while the order row keeps
      // saying DEPOSIT_PAID: the state is not the authority, the port is.
      await unsatisfyDeposit(context, order.orderId);

      const response = await move(jobId, { to: 'STARTED' }).expect(409);
      expect((response.body as { code?: string }).code).toBe('PRODUCTION_DEPOSIT_NOT_SATISFIED');

      await expect(orderStatusOf(order.orderId)).resolves.toBe('DEPOSIT_PAID');
      expect((await context.reservationsOf(order.orderId))[0]?.status).toBe('RESERVED');
      await expect(context.onHand(skuId)).resolves.toBe(ON_HAND);
      await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
      await expect(context.ledgerKindsOf(skuId)).resolves.toEqual(['RESERVED']);
    });

    /** Case S5 — GRD-022, and its own truthful code. */
    it.each(['ON_HOLD', 'CANCELLING'] as const)(
      'refuses a %s order before any inventory is terminalized',
      async (state) => {
        const { order, jobId, skuId } = await startableCatalogOrder();
        await context.moveOrder(order.orderId, state, 'Khách yêu cầu tạm dừng');

        const response = await move(jobId, { to: 'STARTED' }).expect(409);
        expect((response.body as { code?: string }).code).toBe('PRODUCTION_ORDER_ON_HOLD');

        expect((await context.reservationsOf(order.orderId))[0]?.status).toBe('RESERVED');
        await expect(context.onHand(skuId)).resolves.toBe(ON_HAND);
        await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
      },
    );

    /** Case S8 — the job's frozen approval is no longer the order's. */
    it('refuses when the job’s approval is not the order’s current one', async () => {
      const { order, jobId, skuId } = await startableCatalogOrder();
      const otherApproval = await context.seedCustomerOwnedApproval(order.fixture);
      await repointOrderApproval(context, order.orderId, otherApproval);

      const response = await move(jobId, { to: 'STARTED' }).expect(409);
      expect((response.body as { code?: string }).code).toBe('PRODUCTION_APPROVAL_MISMATCH');

      expect((await context.reservationsOf(order.orderId))[0]?.status).toBe('RESERVED');
      await expect(context.onHand(skuId)).resolves.toBe(ON_HAND);
      await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
    });

    /** Case S6, single-SKU half — an uncovered requirement. */
    it('refuses when the required reservation was already released', async () => {
      const { order, jobId, skuId } = await startableCatalogOrder();
      await releaseAllReservations(context, order.orderId, 'Huỷ giữ hàng');

      const response = await move(jobId, { to: 'STARTED' }).expect(409);
      expect((response.body as { code?: string }).code).toBe('PRODUCTION_RESERVATION_NOT_ACTIVE');

      await expect(orderStatusOf(order.orderId)).resolves.toBe('DEPOSIT_PAID');
      await expect(context.onHand(skuId)).resolves.toBe(ON_HAND);
      await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Case S6 — the rollback proof (§21.5). This is the property the whole
  // checkpoint exists for, so it inspects every row class after the failure.
  // -------------------------------------------------------------------------

  describe('case S6 — a multi-SKU start whose later requirement is uncovered', () => {
    it('rolls back the consumption the earlier requirement had already made', async () => {
      const fixture = await context.seedChain('b04-multi');
      const secondSkuId = await context.seedSecondSku(fixture);
      // Ascending SKU id is the lock and processing order, so whichever of the
      // two sorts first is the one that would otherwise be consumed before the
      // failure. Reserving only that one guarantees a *late* failure whichever
      // way the two ids happen to sort.
      const [firstSku, lateSku] = [fixture.skuId, secondSkuId].sort();
      const order = await context.seedOrder({
        fixture,
        items: [
          catalogItem(fixture, 1, CATALOG_QUANTITY),
          { ...catalogItem(fixture, 2, CATALOG_QUANTITY), skuId: secondSkuId },
        ],
      });
      await context.seedStock(firstSku as string, ON_HAND);
      await context.seedStock(lateSku as string, ON_HAND);
      await context.seedReservation(order.orderId, firstSku as string, CATALOG_QUANTITY);
      await context.moveOrder(order.orderId, 'DEPOSIT_PAID');
      const created = dataOf<CreatedPayload>(await create(order.orderId).expect(201));

      const response = await move(created.jobId, { to: 'STARTED' }).expect(409);
      expect((response.body as { code?: string }).code).toBe('PRODUCTION_RESERVATION_NOT_ACTIVE');

      // The whole transaction, not the failing statement: the first SKU's
      // reservation is the one that would already have been consumed.
      const reservations = await context.reservationsOf(order.orderId);
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.status).toBe('RESERVED');
      await expect(context.onHand(firstSku as string)).resolves.toBe(ON_HAND);
      await expect(context.ledgerKindsOf(firstSku as string)).resolves.toEqual(['RESERVED']);

      await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
      await expect(orderStatusOf(order.orderId)).resolves.toBe('DEPOSIT_PAID');
      await expect(context.countRows('audit_events')).resolves.toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Case S7 — a repeated start after a committed one.
  // -------------------------------------------------------------------------

  describe('case S7 — a repeated start', () => {
    it('cannot decrement stock twice or append a second transition', async () => {
      const { order, jobId, skuId } = await startableCatalogOrder();
      await move(jobId, { to: 'STARTED' }).expect(200);

      const response = await move(jobId, { to: 'STARTED' }).expect(409);
      expect((response.body as { code?: string }).code).toBe('PRODUCTION_INVALID_TRANSITION');

      await expect(context.onHand(skuId)).resolves.toBe(ON_HAND - CATALOG_QUANTITY);
      await expect(context.ledgerKindsOf(skuId)).resolves.toEqual(['RESERVED', 'CONSUMED']);
      await expect(context.countRows('production_job_transitions')).resolves.toBe(1);
      await expect(orderStatusOf(order.orderId)).resolves.toBe('IN_PRODUCTION');
    });
  });

  // -------------------------------------------------------------------------
  // Cases C1–C3 — completion.
  // -------------------------------------------------------------------------

  describe('completion', () => {
    /** Case C1. */
    it('moves the job and the order together, and stops at PRODUCTION_COMPLETED', async () => {
      const { order, jobId, skuId } = await startableCatalogOrder();
      await move(jobId, { to: 'STARTED' }).expect(200);

      const result = dataOf<TransitionPayload>(await move(jobId, { to: 'COMPLETED' }).expect(200));

      expect(result.fromStatus).toBe('STARTED');
      expect(result.status).toBe('COMPLETED');
      expect(result.orderStatus).toBe('PRODUCTION_COMPLETED');
      await expect(orderStatusOf(order.orderId)).resolves.toBe('PRODUCTION_COMPLETED');

      // APP8 does not continue to AWAITING_FINAL_PAYMENT (TR-LC14-05, APP9).
      expect(result.orderStatus).not.toBe('AWAITING_FINAL_PAYMENT');
      // Completion moves no inventory: the goods were issued at start.
      expect(result.reservationIds).toEqual([]);
      await expect(context.ledgerKindsOf(skuId)).resolves.toEqual(['RESERVED', 'CONSUMED']);
      await expect(context.countRows('production_job_transitions')).resolves.toBe(2);
    });

    /** Case C2 — one side invalid, so neither side moves. */
    it('refuses when the job is STARTED but the order is not IN_PRODUCTION', async () => {
      const { order, jobId } = await startableCatalogOrder();
      await move(jobId, { to: 'STARTED' }).expect(200);
      await context.moveOrder(order.orderId, 'ON_HOLD', 'Chờ xác nhận');

      const response = await move(jobId, { to: 'COMPLETED' }).expect(409);
      expect((response.body as { code?: string }).code).toBe('PRODUCTION_ORDER_ON_HOLD');

      await expect(orderStatusOf(order.orderId)).resolves.toBe('ON_HOLD');
      await expect(context.countRows('production_job_transitions')).resolves.toBe(1);
    });

    /** Case C3. */
    it('refuses a repeated completion and appends no duplicate transition', async () => {
      const { jobId } = await startableCatalogOrder();
      await move(jobId, { to: 'STARTED' }).expect(200);
      await move(jobId, { to: 'COMPLETED' }).expect(200);

      const response = await move(jobId, { to: 'COMPLETED' }).expect(409);
      expect((response.body as { code?: string }).code).toBe('PRODUCTION_INVALID_TRANSITION');

      await expect(context.countRows('production_job_transitions')).resolves.toBe(2);
      await expect(context.countRows('order_transitions')).resolves.toBe(3);
    });
  });
});
