/**
 * `APP8-B04` §21.3 — production-job cancellation, against a real PostgreSQL
 * instance and through the real HTTP route.
 *
 * The four mandatory cases, and the boundary that makes them a *production*
 * cancellation rather than the order cancellation saga: after every one of them
 * the order's own commercial state is exactly what it was. `APP8-G01` §5.2 gives
 * APP8 the job move and the release of a still-active Catalog reservation and
 * nothing else — no `CANCELLING`, no `CANCELLED`, no refund, no settlement — so
 * each test asserts the order's status explicitly rather than leaving the
 * absence of a move to be inferred.
 */
import request from 'supertest';

import {
  createAdminProductionContext,
  dataOf,
  ROUTES,
  type AdminProductionTestContext,
  type SeededOrder,
} from './admin-production-context';
import { customerOwnedProductOf } from './production-transition-support';

interface CreatedPayload {
  readonly jobId: string;
}

interface TransitionPayload {
  readonly fromStatus: string;
  readonly status: string;
  readonly orderStatus: string;
  readonly reservationIds: readonly string[];
}

const CATALOG_QUANTITY = 25;
const ON_HAND = 100;
const REASON = 'Máy thêu hỏng, chuyển sang lô sau';

describe('APP8-B04 — production job cancellation (integration)', () => {
  let context: AdminProductionTestContext;

  beforeAll(async () => {
    context = await createAdminProductionContext('app8-b04-cancel');
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

  async function plannedCatalogJob(): Promise<{
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

  /** Case X1 — the one case where inventory actually comes back. */
  describe('case X1 — cancelling a PLANNED Catalog job', () => {
    it('releases the still-active reservation and leaves the order where it was', async () => {
      const { order, jobId, skuId } = await plannedCatalogJob();

      const result = dataOf<TransitionPayload>(
        await move(jobId, { to: 'CANCELLED', reason: REASON }).expect(200),
      );

      expect(result.fromStatus).toBe('PLANNED');
      expect(result.status).toBe('CANCELLED');
      expect(result.reservationIds).toHaveLength(1);

      const reservations = await context.reservationsOf(order.orderId);
      expect(reservations[0]?.status).toBe('RELEASED');
      // The mandatory reason travels onto the reservation, so the inventory
      // record explains itself without the production job beside it.
      expect(reservations[0]?.releasedReason).toBe(REASON);
      await expect(context.ledgerKindsOf(skuId)).resolves.toEqual([
        'RESERVED',
        'RESERVATION_RELEASED',
      ]);

      // A release returns the quantity to availability; the goods never left,
      // so on-hand does not move.
      await expect(context.onHand(skuId)).resolves.toBe(ON_HAND);

      // The boundary: APP8 cancels the production job, not the order.
      expect(result.orderStatus).toBe('DEPOSIT_PAID');
      await expect(orderStatusOf(order.orderId)).resolves.toBe('DEPOSIT_PAID');
    });
  });

  /** Case X2 — nothing to release, and nothing invented to release. */
  describe('case X2 — cancelling a PLANNED customer-owned-only job', () => {
    it('cancels with zero inventory effect and fabricates no reservation', async () => {
      const fixture = await context.seedChain('b04-cancel-cop');
      const approvalSnapshotId = await context.seedCustomerOwnedApproval(fixture);
      const copProductId = await customerOwnedProductOf(context, approvalSnapshotId);
      const order = await context.seedOrder({
        fixture,
        approvalSnapshotId,
        items: [context.customerOwnedItem(copProductId)],
      });
      const created = dataOf<CreatedPayload>(await create(order.orderId).expect(201));

      const result = dataOf<TransitionPayload>(
        await move(created.jobId, { to: 'CANCELLED', reason: REASON }).expect(200),
      );

      expect(result.status).toBe('CANCELLED');
      expect(result.reservationIds).toEqual([]);
      await expect(context.countRows('inventory_reservations')).resolves.toBe(0);
      await expect(context.countRows('inventory_ledger_entries')).resolves.toBe(0);
    });
  });

  /** Case X3 — the case §13.2 exists for. */
  describe('case X3 — cancelling a STARTED job', () => {
    it('does not unconsume inventory and does not move the order out of IN_PRODUCTION', async () => {
      const { order, jobId, skuId } = await plannedCatalogJob();
      await move(jobId, { to: 'STARTED' }).expect(200);

      const result = dataOf<TransitionPayload>(
        await move(jobId, { to: 'CANCELLED', reason: REASON }).expect(200),
      );

      expect(result.fromStatus).toBe('STARTED');
      expect(result.status).toBe('CANCELLED');
      // Nothing was released, because nothing was still reserved.
      expect(result.reservationIds).toEqual([]);

      const reservations = await context.reservationsOf(order.orderId);
      expect(reservations[0]?.status).toBe('CONSUMED');
      // No fake release beside the consume, and no restock.
      await expect(context.ledgerKindsOf(skuId)).resolves.toEqual(['RESERVED', 'CONSUMED']);
      await expect(context.onHand(skuId)).resolves.toBe(ON_HAND - CATALOG_QUANTITY);

      // APP8 does not run the order cancellation saga: the order stays where the
      // start put it and is handed to later authority as it is.
      expect(result.orderStatus).toBe('IN_PRODUCTION');
      await expect(orderStatusOf(order.orderId)).resolves.toBe('IN_PRODUCTION');
    });
  });

  /** Case X4 — a cancellation without a reason is not a cancellation. */
  describe('case X4 — cancelling with no reason', () => {
    it('is refused and mutates nothing', async () => {
      const { order, jobId, skuId } = await plannedCatalogJob();

      const response = await move(jobId, { to: 'CANCELLED' }).expect(400);
      expect((response.body as { code?: string }).code).toBe('BAD_REQUEST');

      await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
      expect((await context.reservationsOf(order.orderId))[0]?.status).toBe('RESERVED');
      await expect(context.onHand(skuId)).resolves.toBe(ON_HAND);
      await expect(orderStatusOf(order.orderId)).resolves.toBe('DEPOSIT_PAID');
    });

    it('is also refused when the reason is only whitespace', async () => {
      const { jobId } = await plannedCatalogJob();

      await move(jobId, { to: 'CANCELLED', reason: '   ' }).expect(400);

      await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
    });
  });

  describe('the cancellation vocabulary', () => {
    it('refuses a reason on a transition that records none', async () => {
      const { jobId } = await plannedCatalogJob();

      await move(jobId, { to: 'STARTED', reason: REASON }).expect(400);

      await expect(context.countRows('production_job_transitions')).resolves.toBe(0);
    });

    it('refuses a second cancellation of an already-cancelled job', async () => {
      const { order, jobId, skuId } = await plannedCatalogJob();
      await move(jobId, { to: 'CANCELLED', reason: REASON }).expect(200);

      const response = await move(jobId, { to: 'CANCELLED', reason: REASON }).expect(409);
      expect((response.body as { code?: string }).code).toBe('PRODUCTION_INVALID_TRANSITION');

      // One transition, one release, one ledger effect — a second cancellation
      // must not release an already-released reservation a second time.
      await expect(context.countRows('production_job_transitions')).resolves.toBe(1);
      await expect(context.ledgerKindsOf(skuId)).resolves.toEqual([
        'RESERVED',
        'RESERVATION_RELEASED',
      ]);
      await expect(orderStatusOf(order.orderId)).resolves.toBe('DEPOSIT_PAID');
    });
  });
});
