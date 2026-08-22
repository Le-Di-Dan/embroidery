/**
 * `GET /api/admin/orders/{orderId}` against a real database (`APP7-B02` §15,
 * §16, §18, §21.2).
 *
 * The suite the frozen-read rule lives or dies by. Two of its cases mutate live
 * Catalog **after** the order exists and then assert the response has not moved:
 * a projection that joined `products` or `skus` to "improve" a label would pass
 * every other test in this checkpoint and fail these two.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  FROZEN_PRODUCT_NAME,
  FROZEN_VARIANT_LABEL,
  ROUTES,
  createAdminOrderContext,
  dataOf,
  type AdminOrderTestContext,
} from './admin-order-context';
import type { OrderItem } from '../../domain/repositories/order.repository';

interface DetailItem {
  readonly position: number;
  readonly subjectKind: string;
  readonly skuId?: string;
  readonly customerOwnedProductId?: string;
  readonly productName: string;
  readonly variantLabel?: string;
  readonly sizeLabel?: string;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
  readonly currencyCode: string;
  readonly approvalSnapshotId: string;
}
interface DetailView {
  readonly orderId: string;
  readonly code: string;
  readonly status: string;
  readonly customRequestId: string;
  readonly customerId: string;
  readonly acceptedQuotationVersionId: string;
  readonly currentApprovalSnapshotId: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly items: readonly DetailItem[];
}

describe('APP7-B02 — the Admin order detail (integration)', () => {
  let context: AdminOrderTestContext;

  beforeAll(async () => {
    context = await createAdminOrderContext('app7-b02-detail');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const get = (orderId: string) =>
    request(context.server()).get(ROUTES.detail(orderId)).set('Cookie', context.adminCookie());

  it('refuses an unauthenticated caller before it looks the order up', async () => {
    const seeded = await context.seedOrder();

    await request(context.server()).get(ROUTES.detail(seeded.orderId)).expect(401);
    await request(context.server())
      .get(ROUTES.detail(seeded.orderId))
      .set('Cookie', 'adm_session=not-a-token-any-session-was-minted-for')
      .expect(401);
  });

  it('answers an unknown order with a stable 404 and a malformed id with a 400', async () => {
    const unknown = await get('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60ff').expect(404);
    expect((unknown.body as { code?: string }).code).toBe('ORDER_NOT_FOUND');

    await get('ORD-7K3MPQ2XVD').expect(400);
  });

  it('returns a catalog order composed of frozen order and order-item facts', async () => {
    const seeded = await context.seedOrder();

    const view = dataOf<DetailView>(await get(seeded.orderId).expect(200));

    expect(view.orderId).toBe(seeded.orderId);
    expect(view.code).toBe(seeded.code);
    expect(view.status).toBe('AWAITING_DEPOSIT');
    expect(view.customRequestId).toBe(seeded.fixture.customRequestId);
    expect(view.customerId).toBe(seeded.fixture.customerId);
    expect(view.acceptedQuotationVersionId).toBe(seeded.fixture.quotationVersionId);
    expect(view.currentApprovalSnapshotId).toBe(seeded.fixture.approvalSnapshotId);
    expect(view.totalAmount).toBe('2550000.00');
    expect(view.currencyCode).toBe('VND');

    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toEqual({
      position: 1,
      subjectKind: 'CATALOG',
      skuId: seeded.fixture.skuId,
      productName: FROZEN_PRODUCT_NAME,
      variantLabel: FROZEN_VARIANT_LABEL,
      quantity: 25,
      unitPriceAmount: '100000.00',
      lineTotalAmount: '2500000.00',
      currencyCode: 'VND',
      approvalSnapshotId: seeded.fixture.approvalSnapshotId,
    });
    // Absent, not null-and-present-as-something-else: `size_label` has no frozen
    // source, and `customerOwnedProductId` belongs to the other branch.
    expect(view.items[0]).not.toHaveProperty('sizeLabel');
    expect(view.items[0]).not.toHaveProperty('customerOwnedProductId');
  });

  it('keeps the frozen product name after the live Catalog product is renamed', async () => {
    const seeded = await context.seedOrder();

    const before = dataOf<DetailView>(await get(seeded.orderId).expect(200));
    expect(before.items[0]?.productName).toBe(FROZEN_PRODUCT_NAME);

    // The exact substitution `APP7-B02` §3 forbids, performed on the live row the
    // order froze its copy from. Nothing about the order changes.
    await context.renameLiveProduct(seeded.fixture, 'Renamed After The Order Existed');

    const after = dataOf<DetailView>(await get(seeded.orderId).expect(200));
    expect(after.items[0]?.productName).toBe(FROZEN_PRODUCT_NAME);
    expect(after.items[0]?.variantLabel).toBe(FROZEN_VARIANT_LABEL);
    expect(after).toEqual(before);
  });

  it('keeps the frozen money after the live SKU is repriced and deactivated', async () => {
    const seeded = await context.seedOrder();
    const db = context.disposable.client.db;

    const before = dataOf<DetailView>(await get(seeded.orderId).expect(200));

    await db.execute(sql`
      update skus set price_override_amount = 999999.00, is_active = false
      where id = ${seeded.fixture.skuId}
    `);
    await db.execute(sql`
      update products set base_price_amount = 1.00 where id = ${seeded.fixture.productId}
    `);

    const after = dataOf<DetailView>(await get(seeded.orderId).expect(200));
    expect(after.items[0]?.unitPriceAmount).toBe('100000.00');
    expect(after.items[0]?.lineTotalAmount).toBe('2500000.00');
    expect(after.totalAmount).toBe('2550000.00');
    expect(after).toEqual(before);
  });

  it('does not recompute the total from the lines, or a line from unit × quantity', async () => {
    const seeded = await context.seedOrder();

    const view = dataOf<DetailView>(await get(seeded.orderId).expect(200));

    // 25 × 100000.00 is 2500000.00 and the line agrees — but the *order* total
    // is 2550000.00, because the accepted version added a shipping fee. A
    // projection that summed the lines would report 2500000.00 here.
    expect(view.items[0]?.lineTotalAmount).toBe('2500000.00');
    expect(view.totalAmount).toBe('2550000.00');
    expect(view.totalAmount).not.toBe(view.items[0]?.lineTotalAmount);
  });

  it('returns a customer-owned order without fabricating any Catalog identity', async () => {
    const fixture = await context.seedChain('cop');
    const cop = await context.seedCustomerOwnedSubject(fixture);

    const item: OrderItem = {
      position: 1,
      skuId: undefined,
      customerOwnedProductId: cop.customerOwnedProductId,
      // `APP7-W01`'s COP branch: the customer-owned product's own name, no
      // variant label, no size label.
      productName: cop.name,
      variantLabel: undefined,
      sizeLabel: undefined,
      quantity: 25,
      unitPriceAmount: '100000.00',
      lineTotalAmount: '2500000.00',
    };
    const seeded = await context.seedOrder({ fixture, items: [item] });

    const view = dataOf<DetailView>(await get(seeded.orderId).expect(200));

    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toEqual({
      position: 1,
      subjectKind: 'CUSTOMER_OWNED',
      customerOwnedProductId: cop.customerOwnedProductId,
      productName: cop.name,
      quantity: 25,
      unitPriceAmount: '100000.00',
      lineTotalAmount: '2500000.00',
      currencyCode: 'VND',
      approvalSnapshotId: fixture.approvalSnapshotId,
    });
    // No SKU, no variant, no size — and no key anywhere in the serialized line
    // naming a Catalog row the customer-owned item never had.
    expect(view.items[0]).not.toHaveProperty('skuId');
    expect(view.items[0]).not.toHaveProperty('variantLabel');
    expect(view.items[0]).not.toHaveProperty('sizeLabel');
    expect(JSON.stringify(view)).not.toContain(fixture.skuId);
    expect(JSON.stringify(view)).not.toContain(fixture.productId);
  });

  it('returns several lines in their frozen position order', async () => {
    const fixture = await context.seedChain('multi');
    const cop = await context.seedCustomerOwnedSubject(fixture);

    const line = (position: number, overrides: Partial<OrderItem>): OrderItem => ({
      position,
      skuId: fixture.skuId,
      customerOwnedProductId: undefined,
      productName: FROZEN_PRODUCT_NAME,
      variantLabel: FROZEN_VARIANT_LABEL,
      sizeLabel: undefined,
      quantity: position,
      unitPriceAmount: '100000.00',
      lineTotalAmount: `${String(position)}00000.00`,
      ...overrides,
    });

    // Inserted out of order on purpose: position, not insertion order, is what
    // `uq_order_items__order_position` makes total.
    const seeded = await context.seedOrder({
      fixture,
      items: [
        line(3, {}),
        line(1, {}),
        line(2, {
          skuId: undefined,
          customerOwnedProductId: cop.customerOwnedProductId,
          productName: cop.name,
          variantLabel: undefined,
        }),
      ],
    });

    const view = dataOf<DetailView>(await get(seeded.orderId).expect(200));

    expect(view.items.map((one) => one.position)).toEqual([1, 2, 3]);
    expect(view.items.map((one) => one.subjectKind)).toEqual([
      'CATALOG',
      'CUSTOMER_OWNED',
      'CATALOG',
    ]);
  });

  it('reports the order’s own state after it moves, and no payment fact with it', async () => {
    const seeded = await context.seedOrder({ status: 'DEPOSIT_PAID' });

    const view = dataOf<DetailView>(await get(seeded.orderId).expect(200));
    expect(view.status).toBe('DEPOSIT_PAID');

    // Order state is order-owned and belongs here. How it got there does not:
    // `APP7-B04` owns the Admin payment surface, and none of it leaks in.
    const serialized = JSON.stringify(view).toLowerCase();
    for (const forbidden of ['payment', 'obligation', 'attempt', 'evidence', 'reference', 'qr']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('never caches an order detail in a shared proxy', async () => {
    const seeded = await context.seedOrder();
    const response = await get(seeded.orderId).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
