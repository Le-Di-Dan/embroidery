/**
 * `GET /api/admin/orders` against a real database (`APP7-B02` §17, §21.2).
 *
 * A small discriminating dataset rather than an exhaustive one: five orders,
 * three of which share a `created_at` instant, is enough to prove the page
 * boundary is total. Two pages of two rows prove continuation; a hundred rows
 * would prove the same thing more slowly.
 */
import request from 'supertest';

import {
  ROUTES,
  createAdminOrderContext,
  dataOf,
  type AdminOrderTestContext,
} from './admin-order-context';

interface QueueItem {
  readonly orderId: string;
  readonly code: string;
  readonly status: string;
  readonly customRequestId: string;
  readonly customerId: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
  readonly createdAt: string;
}
interface QueueView {
  readonly items: readonly QueueItem[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

/**
 * One instant shared by three orders.
 *
 * `created_at` is not unique, so this is the case a keyset without a tie-break
 * gets wrong: without the `id` tie-break the boundary between page one and page
 * two would either repeat a row or skip one.
 */
const SHARED_INSTANT = '2026-08-20T09:00:00.000Z';

describe('APP7-B02 — the Admin order queue (integration)', () => {
  let context: AdminOrderTestContext;

  beforeAll(async () => {
    context = await createAdminOrderContext('app7-b02-queue');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const get = (query = '') =>
    request(context.server()).get(`${ROUTES.queue()}${query}`).set('Cookie', context.adminCookie());

  /** Five orders: three at one instant, one older, one newer. */
  async function seedFive(): Promise<void> {
    await context.seedOrder({ createdAt: '2026-08-20T10:00:00.000Z' });
    await context.seedOrder({ createdAt: SHARED_INSTANT });
    await context.seedOrder({ createdAt: SHARED_INSTANT });
    await context.seedOrder({ createdAt: SHARED_INSTANT });
    await context.seedOrder({ createdAt: '2026-08-20T08:00:00.000Z' });
  }

  it('refuses an unauthenticated caller and one bearing an unminted token', async () => {
    await request(context.server()).get(ROUTES.queue()).expect(401);
    await request(context.server())
      .get(ROUTES.queue())
      .set('Cookie', 'adm_session=not-a-token-any-session-was-minted-for')
      .expect(401);
  });

  it('answers an empty table with an empty page rather than an error', async () => {
    const response = await get().expect(200);
    const view = dataOf<QueueView>(response);

    expect(view.items).toEqual([]);
    expect(view.hasNext).toBe(false);
    expect(view.nextCursor).toBeUndefined();
  });

  it('bounds the page size and reports the frozen order-owned facts', async () => {
    const seeded = await context.seedOrder();

    const view = dataOf<QueueView>(await get().expect(200));
    expect(view.items).toHaveLength(1);

    const [item] = view.items;
    // Asserted key by key, and the key set asserted whole: a field the row gains
    // later fails here rather than reaching an Admin screen unnoticed.
    expect(Object.keys(item ?? {}).sort()).toEqual([
      'code',
      'createdAt',
      'currencyCode',
      'customRequestId',
      'customerId',
      'orderId',
      'status',
      'totalAmount',
    ]);
    expect(item?.orderId).toBe(seeded.orderId);
    expect(item?.code).toBe(seeded.code);
    expect(item?.status).toBe('AWAITING_DEPOSIT');
    expect(item?.customRequestId).toBe(seeded.fixture.customRequestId);
    expect(item?.customerId).toBe(seeded.fixture.customerId);
    // The accepted quotation version's own total, frozen by the canonical
    // writer and transported unchanged — not a sum over the order's lines,
    // whose one line totals 2500000.00.
    expect(item?.totalAmount).toBe('2550000.00');
    expect(item?.currencyCode).toBe('VND');
    expect(Number.isNaN(Date.parse(item?.createdAt ?? ''))).toBe(false);
  });

  it('clamps an oversized page size instead of returning an unbounded dump', async () => {
    await seedFive();

    const view = dataOf<QueueView>(await get('?limit=100').expect(200));
    expect(view.items).toHaveLength(5);
    expect(view.hasNext).toBe(false);

    await get('?limit=101').expect(400);
    await get('?limit=0').expect(400);
  });

  it('pages deterministically across an equal-timestamp boundary', async () => {
    await seedFive();

    const first = dataOf<QueueView>(await get('?limit=2').expect(200));
    expect(first.items).toHaveLength(2);
    expect(first.hasNext).toBe(true);
    expect(first.nextCursor).toBeDefined();

    const second = dataOf<QueueView>(
      await get(`?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`).expect(200),
    );
    expect(second.items).toHaveLength(2);

    const third = dataOf<QueueView>(
      await get(`?limit=2&cursor=${encodeURIComponent(second.nextCursor ?? '')}`).expect(200),
    );
    expect(third.items).toHaveLength(1);
    expect(third.hasNext).toBe(false);
    expect(third.nextCursor).toBeUndefined();

    const paged = [...first.items, ...second.items, ...third.items].map((item) => item.orderId);
    // Every row once: no duplicate at the boundary, and none missing.
    expect(new Set(paged).size).toBe(5);

    const whole = dataOf<QueueView>(await get('?limit=100').expect(200));
    // The paged walk and the single page agree, in the same order — which is
    // what makes the ordering stable rather than merely sorted.
    expect(paged).toEqual(whole.items.map((item) => item.orderId));
  });

  it('orders newest first, with a descending id tie-break at an equal instant', async () => {
    await seedFive();

    const view = dataOf<QueueView>(await get('?limit=100').expect(200));
    const instants = view.items.map((item) => item.createdAt);
    expect([...instants]).toEqual([...instants].sort().reverse());

    const tied = view.items.filter((item) => item.createdAt === SHARED_INSTANT);
    expect(tied).toHaveLength(3);
    const tiedIds = tied.map((item) => item.orderId);
    expect(tiedIds).toEqual([...tiedIds].sort().reverse());
  });

  it('refuses a malformed cursor rather than silently restarting at page one', async () => {
    await seedFive();

    for (const cursor of ['not-base64url!', 'YWJj', Buffer.from('["x"]').toString('base64url')]) {
      const response = await get(`?limit=2&cursor=${encodeURIComponent(cursor)}`).expect(400);
      expect((response.body as { code?: string }).code).toBe('ORDER_CURSOR_INVALID');
    }
  });

  it('filters by stored status, and applies no default subset when none is named', async () => {
    await context.seedOrder({ createdAt: SHARED_INSTANT });
    const paid = await context.seedOrder({
      createdAt: '2026-08-20T10:00:00.000Z',
      status: 'DEPOSIT_PAID',
    });

    const filtered = dataOf<QueueView>(await get('?status=DEPOSIT_PAID').expect(200));
    expect(filtered.items.map((item) => item.orderId)).toEqual([paid.orderId]);

    const both = dataOf<QueueView>(
      await get('?status=DEPOSIT_PAID&status=AWAITING_DEPOSIT').expect(200),
    );
    expect(both.items).toHaveLength(2);

    // No status parameter means every state — an order that has moved on is not
    // hidden by a triage default LC-14 never defined.
    const unfiltered = dataOf<QueueView>(await get().expect(200));
    expect(unfiltered.items.map((item) => item.status).sort()).toEqual([
      'AWAITING_DEPOSIT',
      'DEPOSIT_PAID',
    ]);
  });

  it('refuses an unknown status and an unknown filter', async () => {
    await context.seedOrder();

    await get('?status=PAID').expect(400);
    await get('?paymentState=VERIFIED').expect(400);
    await get('?productName=Tee').expect(400);
  });

  it('never caches an operational queue in a shared proxy', async () => {
    const response = await get().expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
