/**
 * `APP8-B03` §16.1 — production job creation, against a real PostgreSQL
 * instance and through the real HTTP route.
 *
 * The six mandatory focused cases, each stated as the property it protects
 * rather than as a call sequence. Everything runs through
 * `POST /api/admin/orders/{orderId}/production-jobs` behind the real
 * `AuthenticatedAdminGuard`, so what is proved is what an operator can actually
 * reach — not what a use case does when a test calls it directly.
 */
import request from 'supertest';
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import {
  createAdminProductionContext,
  dataOf,
  FROZEN_PRODUCT_NAME,
  ROUTES,
  type AdminProductionTestContext,
} from './admin-production-context';

interface CreatedPayload {
  readonly jobId: string;
  readonly orderId: string;
  readonly approvalSnapshotId: string;
  readonly status: string;
}

interface DetailPayload {
  readonly jobId: string;
  readonly status: string;
  readonly specification?: {
    readonly approvalSnapshotId: string;
    readonly productName: string;
    readonly variantLabel?: string;
    readonly quantityTotal: number;
    readonly documentHash: string;
  };
  readonly reservationSummary?: {
    readonly required: boolean;
    readonly catalogItemCount: number;
    readonly customerOwnedItemCount: number;
    readonly reservations: readonly unknown[];
  };
}

describe('APP8-B03 — production job creation (integration)', () => {
  let context: AdminProductionTestContext;

  beforeAll(async () => {
    context = await createAdminProductionContext('app8-b03-create');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const post = (orderId: string, body: Record<string, unknown> = {}) =>
    request(context.server())
      .post(ROUTES.create(orderId))
      .set('Cookie', context.adminCookie())
      .send(body);

  const detail = (jobId: string) =>
    request(context.server()).get(ROUTES.detail(jobId)).set('Cookie', context.adminCookie());

  /** Case 1 — a Catalog order with a satisfied deposit. */
  describe('a valid Catalog order', () => {
    it('creates exactly one PLANNED job against the order’s own approval', async () => {
      const order = await context.seedOrder();

      const response = await post(order.orderId).expect(201);
      const created = dataOf<CreatedPayload>(response);

      expect(created.status).toBe('PLANNED');
      expect(created.orderId).toBe(order.orderId);
      // The identity `uq_production_jobs__order_approval_snapshot` arbitrates,
      // resolved from `orders.current_approval_snapshot_id` rather than sent.
      expect(created.approvalSnapshotId).toBe(order.approvalSnapshotId);
      await expect(context.countRows('production_jobs')).resolves.toBe(1);
      await expect(context.countRows('production_specifications')).resolves.toBe(1);
    });

    it('freezes the specification from that approval, not from live catalog state', async () => {
      const order = await context.seedOrder();
      const created = dataOf<CreatedPayload>(await post(order.orderId).expect(201));

      const view = dataOf<DetailPayload>(await detail(created.jobId).expect(200));

      expect(view.specification?.approvalSnapshotId).toBe(order.approvalSnapshotId);
      // Every value below is a column of `approval_snapshots`, copied at
      // creation — never a join against `products`/`product_variants`.
      expect(view.specification?.productName).toBe(FROZEN_PRODUCT_NAME);
      expect(view.specification?.quantityTotal).toBe(25);
      expect(view.specification?.documentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
  });

  /** Case 2 — COP-only, which can never carry a reservation. */
  describe('a customer-owned-only order', () => {
    it('creates the job without requiring or fabricating any inventory reservation', async () => {
      const fixture = await context.seedChain('cop');
      const approvalSnapshotId = await context.seedCustomerOwnedApproval(fixture);
      const copProductId = (
        await context.disposable.client.db.execute<{ id: string }>(
          sql`select customer_owned_product_id as id from approval_snapshots where id = ${approvalSnapshotId}`,
        )
      ).rows[0]?.id;
      const order = await context.seedOrder({
        fixture,
        approvalSnapshotId,
        items: [context.customerOwnedItem(copProductId ?? '')],
      });

      const created = dataOf<CreatedPayload>(await post(order.orderId).expect(201));

      expect(created.status).toBe('PLANNED');
      // PO-APP8-001 §1.3 — no SKU, no `sku_stocks` row and no reservation is
      // fabricated so the COP branch has something to satisfy a gate with.
      const [reservations] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from inventory_reservations`,
        )
      ).rows;
      expect(Number(reservations?.count)).toBe(0);

      const view = dataOf<DetailPayload>(await detail(created.jobId).expect(200));
      expect(view.reservationSummary?.required).toBe(false);
      expect(view.reservationSummary?.catalogItemCount).toBe(0);
      expect(view.reservationSummary?.customerOwnedItemCount).toBe(1);
      expect(view.reservationSummary?.reservations).toEqual([]);
    });
  });

  /** Case 3 — GRD-013, through the one deposit authority. */
  describe('an order whose deposit is not satisfied', () => {
    it('creates no job, no specification and no partial row', async () => {
      const order = await context.seedOrder({ depositSatisfied: false });

      const response = await post(order.orderId).expect(409);

      expect((response.body as { code?: string }).code).toBe('PRODUCTION_DEPOSIT_NOT_SATISFIED');
      await expect(context.countRows('production_jobs')).resolves.toBe(0);
      await expect(context.countRows('production_specifications')).resolves.toBe(0);
    });

    it('creates the job once the same order’s deposit becomes satisfied', async () => {
      const order = await context.seedOrder({ depositSatisfied: false });
      await post(order.orderId).expect(409);

      await context.satisfyDeposit(order.orderId, order.fixture.quotationVersionId);

      // The refusal was a gate, not a verdict about the order — which is why it
      // is `PRODUCTION_DEPOSIT_NOT_SATISFIED` and not a not-found.
      await post(order.orderId).expect(201);
      await expect(context.countRows('production_jobs')).resolves.toBe(1);
    });
  });

  /** Case 4 — the linkage §5.3 exists for. */
  describe('a cross-order approval', () => {
    it('refuses an approval snapshot belonging to another order, creating nothing', async () => {
      const orderA = await context.seedOrder();
      const orderB = await context.seedOrder();

      const response = await post(orderA.orderId, {
        approvalSnapshotId: orderB.approvalSnapshotId,
      }).expect(409);

      // Not a 404: both rows exist, and the operator got the pairing wrong.
      expect((response.body as { code?: string }).code).toBe('PRODUCTION_APPROVAL_MISMATCH');
      await expect(context.countRows('production_jobs')).resolves.toBe(0);
      await expect(context.countRows('production_specifications')).resolves.toBe(0);
    });

    it('accepts the order’s own approval when the caller names it', async () => {
      const order = await context.seedOrder();

      const created = dataOf<CreatedPayload>(
        await post(order.orderId, { approvalSnapshotId: order.approvalSnapshotId }).expect(201),
      );

      expect(created.approvalSnapshotId).toBe(order.approvalSnapshotId);
    });

    it('reports an unknown order as not found rather than as a mismatch', async () => {
      await post(newId()).expect(404);
      await expect(context.countRows('production_jobs')).resolves.toBe(0);
    });
  });

  /** Case 5 — the unique arbiter, not a second idempotency subsystem. */
  describe('a repeated creation for the same order and approval', () => {
    it('leaves exactly one job and one specification behind', async () => {
      const order = await context.seedOrder();
      const first = dataOf<CreatedPayload>(await post(order.orderId).expect(201));

      const second = await post(order.orderId).expect(409);

      expect((second.body as { code?: string }).code).toBe('PRODUCTION_JOB_ALREADY_EXISTS');
      await expect(context.countRows('production_jobs')).resolves.toBe(1);
      await expect(context.countRows('production_specifications')).resolves.toBe(1);
      // The surviving row is the first one; the refusal replaced nothing.
      const view = dataOf<DetailPayload>(await detail(first.jobId).expect(200));
      expect(view.jobId).toBe(first.jobId);
      // A refused creation appends no transition either.
      const [transitions] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from production_job_transitions`,
        )
      ).rows;
      expect(Number(transitions?.count)).toBe(0);
    });
  });

  /** Case 6 — the copy cannot drift. */
  describe('frozen-copy fidelity', () => {
    it('keeps the specification when the live catalog product is renamed', async () => {
      const order = await context.seedOrder();
      const created = dataOf<CreatedPayload>(await post(order.orderId).expect(201));

      await context.renameLiveProduct(order.fixture, 'Renamed After Production Planned');

      const view = dataOf<DetailPayload>(await detail(created.jobId).expect(200));
      // A copy, not a live read (INV-03). The machine is cut from what the
      // customer approved, whatever the catalog says afterwards.
      expect(view.specification?.productName).toBe(FROZEN_PRODUCT_NAME);
    });
  });

  describe('the mutation is Admin-only', () => {
    it('refuses a request with no Admin session and creates nothing', async () => {
      const order = await context.seedOrder();

      await request(context.server()).post(ROUTES.create(order.orderId)).send({}).expect(401);

      await expect(context.countRows('production_jobs')).resolves.toBe(0);
    });
  });
});
