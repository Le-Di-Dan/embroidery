/**
 * `APP5-B04` — the Admin request queue, over real HTTP against PostgreSQL
 * (§15.2).
 *
 * Every case here goes through the real guard, the real Zod pipe, the real
 * envelope interceptor and the real repositories. Nothing is overridden.
 */
import request from 'supertest';

import {
  createAdminRequestContext,
  dataOf,
  FIXTURE_EMAIL,
  FIXTURE_PHONE,
  ROUTES,
  SECRET_MARKER,
  type AdminRequestTestContext,
  type SeededCatalogSubject,
} from './admin-request-context';

interface QueueItem {
  readonly requestId: string;
  readonly code: string;
  readonly status: string;
  readonly subjectKind: string;
  readonly subjectSummary?: string;
  readonly customerId: string;
  readonly customerDisplayName?: string;
  readonly submittedAt: string;
  readonly totalQuantity: number;
}

interface QueuePage {
  readonly items: readonly QueueItem[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
  readonly appliedStatuses: readonly string[];
}

describe('APP5-B04 — Admin custom request queue', () => {
  let context: AdminRequestTestContext;
  let cookie: string;
  let customerId: string;
  let catalog: SeededCatalogSubject;

  beforeAll(async () => {
    context = await createAdminRequestContext('app5-b04-queue');
  }, 180_000);

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.reset();
    cookie = (await context.seedAdminSession()).cookie;
    customerId = await context.seedCustomer();
    catalog = await context.seedCatalogSubject();
  });

  async function readQueue(query = ''): Promise<QueuePage> {
    const response = await request(context.server())
      .get(`${ROUTES.queue()}${query}`)
      .set('Cookie', cookie)
      .expect(200);
    return dataOf<QueuePage>(response);
  }

  describe('authorization', () => {
    it('refuses a caller with no Admin session', async () => {
      await request(context.server()).get(ROUTES.queue()).expect(401);
    });

    it('refuses a token no session was minted for', async () => {
      await request(context.server())
        .get(ROUTES.queue())
        .set('Cookie', 'adm_session=not-a-real-session-token')
        .expect(401);
    });

    it('serves an authenticated Admin', async () => {
      const page = await readQueue();
      expect(page.items).toEqual([]);
      expect(page.hasNext).toBe(false);
    });
  });

  describe('default triage scope', () => {
    it('carries the pre-quotation states and reports which it applied', async () => {
      await context.seedRequest({ customerId, status: 'NEW' });
      await context.seedRequest({ customerId, status: 'UNDER_REVIEW' });
      await context.seedRequest({ customerId, status: 'NEEDS_CLARIFICATION' });
      await context.seedRequest({ customerId, status: 'QUOTED' });
      await context.seedRequest({ customerId, status: 'REJECTED' });

      const page = await readQueue();

      expect(page.appliedStatuses).toEqual(['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION']);
      expect(page.items.map((item) => item.status).sort()).toEqual([
        'NEEDS_CLARIFICATION',
        'NEW',
        'UNDER_REVIEW',
      ]);
    });

    it('reports a specifically requested canonical status truthfully', async () => {
      const quoted = await context.seedRequest({ customerId, status: 'QUOTED' });

      const page = await readQueue('?status=QUOTED');

      expect(page.appliedStatuses).toEqual(['QUOTED']);
      expect(page.items.map((item) => item.requestId)).toEqual([quoted.requestId]);
    });

    it('accepts a repeated status parameter', async () => {
      await context.seedRequest({ customerId, status: 'REJECTED' });
      await context.seedRequest({ customerId, status: 'CANCELLED' });
      await context.seedRequest({ customerId, status: 'NEW' });

      const page = await readQueue('?status=REJECTED&status=CANCELLED');

      expect(page.items.map((item) => item.status).sort()).toEqual(['CANCELLED', 'REJECTED']);
    });
  });

  describe('filters', () => {
    it('filters by subject kind', async () => {
      const catalogRequest = await context.seedRequest({
        customerId,
        catalog: { productId: catalog.productId, productVariantId: catalog.productVariantId },
      });
      const copRequest = await context.seedRequest({
        customerId,
        customerOwnedProduct: { name: 'Áo khoác jean cá nhân' },
      });

      const catalogPage = await readQueue('?subjectKind=CATALOG');
      expect(catalogPage.items.map((item) => item.requestId)).toEqual([catalogRequest.requestId]);

      const copPage = await readQueue('?subjectKind=CUSTOMER_OWNED');
      expect(copPage.items.map((item) => item.requestId)).toEqual([copRequest.requestId]);
    });

    it('finds one request by its whole code, case-insensitively', async () => {
      const target = await context.seedRequest({ customerId });
      await context.seedRequest({ customerId });

      const page = await readQueue(`?code=${target.code.toLowerCase()}`);

      expect(page.items.map((item) => item.requestId)).toEqual([target.requestId]);
    });

    it('refuses a partial code instead of turning it into a prefix search', async () => {
      const target = await context.seedRequest({ customerId });
      await request(context.server())
        .get(`${ROUTES.queue()}?code=${target.code.slice(0, 8)}`)
        .set('Cookie', cookie)
        .expect(400);
    });

    it('filters by submitted time range', async () => {
      const older = await context.seedRequest({
        customerId,
        createdAt: '2026-08-01T09:00:00.000Z',
      });
      const newer = await context.seedRequest({
        customerId,
        createdAt: '2026-08-15T09:00:00.000Z',
      });

      const page = await readQueue(
        '?submittedFrom=2026-08-10T00:00:00.000Z&submittedTo=2026-08-20T00:00:00.000Z',
      );

      expect(page.items.map((item) => item.requestId)).toEqual([newer.requestId]);
      expect(page.items.map((item) => item.requestId)).not.toContain(older.requestId);
    });

    it('filters by one exact contact, and by either of the customer’s contacts', async () => {
      const other = await context.seedCustomer({
        email: 'chi.tran@vidu-b04.test',
        phone: '+84987654321',
        displayName: 'Trần Chi',
      });
      const mine = await context.seedRequest({ customerId });
      await context.seedRequest({ customerId: other });

      const byEmail = await readQueue(
        `?contactKind=EMAIL&contact=${encodeURIComponent(FIXTURE_EMAIL)}`,
      );
      expect(byEmail.items.map((item) => item.requestId)).toEqual([mine.requestId]);

      const byPhone = await readQueue(
        `?contactKind=PHONE&contact=${encodeURIComponent(FIXTURE_PHONE)}`,
      );
      expect(byPhone.items.map((item) => item.requestId)).toEqual([mine.requestId]);
    });

    it('normalizes the contact before matching it', async () => {
      const mine = await context.seedRequest({ customerId });

      // Upper case and surrounding space: the canonical email normalizer is
      // reused, so an operator's copy-paste still resolves.
      const page = await readQueue(
        `?contactKind=EMAIL&contact=${encodeURIComponent(`  ${FIXTURE_EMAIL.toUpperCase()}  `)}`,
      );

      expect(page.items.map((item) => item.requestId)).toEqual([mine.requestId]);
    });

    it('answers an unmatched contact with an empty page, not an error', async () => {
      await context.seedRequest({ customerId });

      const page = await readQueue('?contactKind=EMAIL&contact=nobody%40vidu-b04.test');

      expect(page.items).toEqual([]);
      expect(page.hasNext).toBe(false);
    });

    it('refuses one half of the contact filter', async () => {
      await request(context.server())
        .get(`${ROUTES.queue()}?contactKind=EMAIL`)
        .set('Cookie', cookie)
        .expect(400);
    });
  });

  describe('row content', () => {
    it('describes a catalog request truthfully', async () => {
      const seeded = await context.seedRequest({
        customerId,
        catalog: { productId: catalog.productId, productVariantId: catalog.productVariantId },
        quantities: [
          { productVariantId: catalog.productVariantId, sizeLabel: 'L', quantity: 12 },
          { productVariantId: catalog.productVariantId, sizeLabel: 'M', quantity: 8 },
        ],
      });

      const [item] = (await readQueue()).items;

      expect(item).toMatchObject({
        requestId: seeded.requestId,
        code: seeded.code,
        status: 'NEW',
        subjectKind: 'CATALOG',
        subjectSummary: catalog.productName,
        customerId,
        customerDisplayName: 'Nguyễn Bảy',
        totalQuantity: 20,
      });
    });

    it('describes a customer-owned request truthfully', async () => {
      await context.seedRequest({
        customerId,
        customerOwnedProduct: { name: 'Áo khoác jean cá nhân' },
        quantities: [{ sizeLabel: 'M', quantity: 3 }],
      });

      const [item] = (await readQueue()).items;

      expect(item).toMatchObject({
        subjectKind: 'CUSTOMER_OWNED',
        subjectSummary: 'Áo khoác jean cá nhân',
        totalQuantity: 3,
      });
    });

    it('reports zero units for a request with no quantity lines', async () => {
      await context.seedRequest({ customerId, customerOwnedProduct: { name: 'Nón lưỡi trai' } });
      const [item] = (await readQueue()).items;
      expect(item?.totalQuantity).toBe(0);
    });
  });

  describe('ordering and pagination', () => {
    it('orders newest first with a deterministic tie-break under an identical instant', async () => {
      const sameInstant = '2026-08-16T09:00:00.000Z';
      const first = await context.seedRequest({ customerId, createdAt: sameInstant });
      const second = await context.seedRequest({ customerId, createdAt: sameInstant });
      const third = await context.seedRequest({ customerId, createdAt: sameInstant });

      const once = await readQueue();
      const twice = await readQueue();

      // Three rows sharing one `created_at`: the id tie-break is the only thing
      // making the order total, so the two reads must agree exactly.
      expect(once.items.map((item) => item.requestId)).toEqual(
        twice.items.map((item) => item.requestId),
      );
      expect(new Set(once.items.map((item) => item.requestId))).toEqual(
        new Set([first.requestId, second.requestId, third.requestId]),
      );
      // `id DESC` under an equal instant, and the ids are UUIDv7 in seed order.
      expect(once.items.map((item) => item.requestId)).toEqual(
        [first.requestId, second.requestId, third.requestId].sort().reverse(),
      );
    });

    it('pages without duplicating or skipping a row', async () => {
      const seeded: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const row = await context.seedRequest({
          customerId,
          // Deliberately identical instants: an offset page or a cursor without
          // a tie-breaker would repeat or lose a row here.
          createdAt: '2026-08-16T09:00:00.000Z',
        });
        seeded.push(row.requestId);
      }

      const first = await readQueue('?limit=2');
      expect(first.items).toHaveLength(2);
      expect(first.hasNext).toBe(true);

      const second = await readQueue(
        `?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
      );
      expect(second.items).toHaveLength(2);
      expect(second.hasNext).toBe(true);

      const third = await readQueue(
        `?limit=2&cursor=${encodeURIComponent(second.nextCursor ?? '')}`,
      );
      expect(third.items).toHaveLength(1);
      expect(third.hasNext).toBe(false);
      expect(third.nextCursor).toBeUndefined();

      const paged = [...first.items, ...second.items, ...third.items].map((item) => item.requestId);
      expect(new Set(paged).size).toBe(5);
      expect(paged.sort()).toEqual([...seeded].sort());
    });

    it('refuses a malformed cursor rather than silently restarting', async () => {
      await request(context.server())
        .get(`${ROUTES.queue()}?cursor=not-a-cursor`)
        .set('Cookie', cookie)
        .expect(400);
    });
  });

  describe('privacy', () => {
    it('publishes no credential, contact value or storage key', async () => {
      const seeded = await context.seedRequest({
        customerId,
        catalog: { productId: catalog.productId, productVariantId: catalog.productVariantId },
        assets: [{ role: 'REFERENCE' }],
        customerNote: 'A note the queue does not carry.',
      });
      await context.seedGrant({ customerId, requestId: seeded.requestId });

      const response = await request(context.server())
        .get(ROUTES.queue())
        .set('Cookie', cookie)
        .expect(200);
      const body = JSON.stringify(response.body);

      expect(body).not.toContain(SECRET_MARKER);
      expect(body).not.toContain(FIXTURE_EMAIL);
      expect(body).not.toContain(FIXTURE_PHONE);
      expect(body).not.toContain('token');
      expect(body).not.toContain('storage');
      // Queue scope: no moderation evidence and no attachment array.
      expect(body).not.toContain('customerNote');
      expect(body).not.toContain('assets');
      expect(body).not.toContain('transitions');
    });

    it('does not cache a moderation queue in a shared proxy', async () => {
      const response = await request(context.server())
        .get(ROUTES.queue())
        .set('Cookie', cookie)
        .expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });
});
