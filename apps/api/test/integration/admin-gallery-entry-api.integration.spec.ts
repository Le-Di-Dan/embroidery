/**
 * `APP11-B01` over HTTP — the four Admin gallery authoring operations end to
 * end.
 *
 * The whole stack runs: the Admin session guard, the Origin allowlist, the
 * JSON-only guard, the Zod validation pipe, the response envelope and the
 * exception filter. What is asserted here and nowhere else is the behaviour a
 * schema check cannot see — that creation really lands as `DRAFT`, that the
 * keyset page really resumes in curated order, that a patch really leaves the
 * fields it omitted alone, and that none of the four routes is reachable
 * without a live Admin session.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const EMAIL = 'gallery@example.test';
const PASSWORD = 'operator-secret-123';
const CATEGORY_ID = '019a0000-0000-7000-8000-000000000001';
const ENTRIES = '/api/admin/gallery-entries';

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
}

interface EntryPayload {
  readonly galleryEntryId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: string;
  readonly displayOrder: number;
  readonly linkedProductId?: string;
  readonly isIndexable: boolean;
  readonly coverAssetId?: string;
  readonly assetCount: number;
  readonly description: string;
  readonly seoTitle?: string;
  readonly seoDescription?: string;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assets: readonly { assetId: string; position: number }[];
}

interface ListPayload {
  readonly items: readonly EntryPayload[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

describe('Admin gallery entry HTTP flow (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app11b01-gallery-http');
    await ctx.app.get(BootstrapStaffUseCase).bootstrap({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.app.get(LoginRateLimiter).reset();
    cookie = await login();
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  }, 240_000);

  async function login(): Promise<string> {
    const res = await ctx.http
      .post('/api/staff/session')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: EMAIL, password: PASSWORD });
    const raw = res.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? (raw as string[]) : [];
    const session = cookies.find((value) => value.startsWith('adm_session='));
    if (session === undefined) {
      throw new Error('login set no adm_session cookie');
    }
    return session.split(';')[0] as string;
  }

  const authed = {
    get: (path: string) => ctx.http.get(path).set('Cookie', cookie),
    post: (path: string) => ctx.http.post(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
    patch: (path: string) => ctx.http.patch(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
  };

  /** A published product, so a link can be proved to resolve by id. */
  async function seedProduct(): Promise<string> {
    const productId = newId();
    await ctx.database.client.db.execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${CATEGORY_ID}, 'Áo thêu', ${`gallery-link-${productId}`},
              '250000', 'VND', 'DRAFT', false, 0, true)
    `);
    return productId;
  }

  /**
   * A per-call slug suffix.
   *
   * A UUIDv7 prefix is a timestamp, so several ids minted inside one test run
   * share their leading characters — slicing one would collide on the unique
   * address rather than exercise it. The counter makes the address unique by
   * construction.
   */
  let slugCounter = 0;

  function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    slugCounter += 1;
    const unique = `${newId().replaceAll('-', '').slice(-8)}${slugCounter}`;
    return {
      title: 'Áo thêu hoa sen',
      slug: `ao-theu-${unique}`,
      description: 'Thêu tay trên vải lanh.',
      displayOrder: 100,
      isIndexable: true,
      ...overrides,
    };
  }

  async function createEntry(overrides: Record<string, unknown> = {}): Promise<EntryPayload> {
    const res = await authed.post(ENTRIES).send(body(overrides));
    expect(res.status).toBe(201);
    return (res.body as Envelope<EntryPayload>).data;
  }

  describe('authorization', () => {
    it('rejects every operation without a live Admin session', async () => {
      const created = await createEntry();

      const anonymous = await Promise.all([
        ctx.http.get(ENTRIES),
        ctx.http.get(`${ENTRIES}/${created.galleryEntryId}`),
        ctx.http.post(ENTRIES).set('Origin', ADMIN_ORIGIN).send(body()),
        ctx.http
          .patch(`${ENTRIES}/${created.galleryEntryId}`)
          .set('Origin', ADMIN_ORIGIN)
          .send({ title: 'Không được' }),
      ]);

      for (const res of anonymous) {
        expect(res.status).toBe(401);
      }

      // …and the write never happened.
      const after = await authed.get(`${ENTRIES}/${created.galleryEntryId}`);
      expect((after.body as Envelope<EntryPayload>).data.title).toBe('Áo thêu hoa sen');
    });

    it('reaches the use case for an authorized staff request', async () => {
      const res = await authed.get(ENTRIES);
      expect(res.status).toBe(200);
      expect((res.body as Envelope<ListPayload>).code).toBe('GALLERY_ENTRY_LIST_READ');
    });
  });

  describe('create', () => {
    it('creates a DRAFT and echoes the authoring fields', async () => {
      const created = await createEntry({ seoTitle: 'SEO', seoDescription: 'Mô tả SEO' });

      expect(created.status).toBe('DRAFT');
      expect(created.archivedAt).toBeUndefined();
      expect(created.assets).toEqual([]);
      expect(created.assetCount).toBe(0);
      expect(created.coverAssetId).toBeUndefined();
      expect(created.seoTitle).toBe('SEO');
      expect(created.linkedProductId).toBeUndefined();
    });

    it('refuses a duplicate slug as a conflict, not a database error', async () => {
      const first = await createEntry();

      const res = await authed.post(ENTRIES).send(body({ slug: first.slug }));

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ success: false, code: 'GALLERY_ENTRY_SLUG_CONFLICT' });
      expect(JSON.stringify(res.body)).not.toMatch(/uq_gallery_entries|constraint|relation/i);
    });

    it('rejects a slug that is not the canonical grammar', async () => {
      const res = await authed.post(ENTRIES).send(body({ slug: 'Áo Thêu' }));
      expect(res.status).toBe(400);
    });

    it('links a product that exists and refuses one that does not', async () => {
      const productId = await seedProduct();
      const linked = await createEntry({ linkedProductId: productId });
      expect(linked.linkedProductId).toBe(productId);

      const res = await authed.post(ENTRIES).send(body({ linkedProductId: newId() }));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        code: 'GALLERY_ENTRY_LINKED_PRODUCT_INVALID',
      });
    });
  });

  describe('detail', () => {
    it('returns the authoring fields and no storage fact', async () => {
      const created = await createEntry();

      const res = await authed.get(`${ENTRIES}/${created.galleryEntryId}`);

      expect(res.status).toBe(200);
      const detail = (res.body as Envelope<EntryPayload>).data;
      expect(detail.galleryEntryId).toBe(created.galleryEntryId);
      expect(detail.assets).toEqual([]);
      const serialized = JSON.stringify(detail);
      expect(serialized).not.toMatch(/storageKey|bucket|checksum|altText|url/i);
    });

    it('is a 404 for an id that does not exist', async () => {
      const res = await authed.get(`${ENTRIES}/${newId()}`);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, code: 'GALLERY_ENTRY_NOT_FOUND' });
    });
  });

  describe('update', () => {
    it('changes the named fields and preserves the omitted ones', async () => {
      const productId = await seedProduct();
      const created = await createEntry({
        linkedProductId: productId,
        seoTitle: 'SEO gốc',
        seoDescription: 'Mô tả gốc',
      });

      const res = await authed
        .patch(`${ENTRIES}/${created.galleryEntryId}`)
        .send({ title: 'Tên mới', displayOrder: 5 });

      expect(res.status).toBe(200);
      const updated = (res.body as Envelope<EntryPayload>).data;
      expect(updated.title).toBe('Tên mới');
      expect(updated.displayOrder).toBe(5);
      // Everything the patch did not name is exactly as it was.
      expect(updated.slug).toBe(created.slug);
      expect(updated.status).toBe('DRAFT');
      expect(updated.description).toBe(created.description);
      expect(updated.seoTitle).toBe('SEO gốc');
      expect(updated.seoDescription).toBe('Mô tả gốc');
      expect(updated.linkedProductId).toBe(productId);
      expect(updated.isIndexable).toBe(true);
    });

    it('clears the optional linked product with an explicit null', async () => {
      const productId = await seedProduct();
      const created = await createEntry({ linkedProductId: productId });

      const res = await authed
        .patch(`${ENTRIES}/${created.galleryEntryId}`)
        .send({ linkedProductId: null });

      expect(res.status).toBe(200);
      expect((res.body as Envelope<EntryPayload>).data.linkedProductId).toBeUndefined();
    });

    it('validates a linked product before touching the stored entry', async () => {
      const created = await createEntry({ title: 'Giữ nguyên' });

      const res = await authed
        .patch(`${ENTRIES}/${created.galleryEntryId}`)
        .send({ title: 'Không được', linkedProductId: newId() });

      expect(res.status).toBe(400);
      const after = await authed.get(`${ENTRIES}/${created.galleryEntryId}`);
      expect((after.body as Envelope<EntryPayload>).data.title).toBe('Giữ nguyên');
    });

    it.each([
      ['slug', { slug: 'dia-chi-moi' }],
      ['status', { status: 'PUBLISHED' }],
      ['archivedAt', { archivedAt: '2026-08-30T00:00:00.000Z' }],
      ['assetIds', { assetIds: [] }],
      ['altText', { altText: 'Một chiếc áo' }],
    ])('refuses a patch that names %s', async (_label, patch) => {
      const created = await createEntry();

      const res = await authed.patch(`${ENTRIES}/${created.galleryEntryId}`).send(patch);

      expect(res.status).toBe(400);
      const after = (
        (await authed.get(`${ENTRIES}/${created.galleryEntryId}`)).body as Envelope<EntryPayload>
      ).data;
      expect(after.slug).toBe(created.slug);
      expect(after.status).toBe('DRAFT');
    });

    it('rejects an empty patch', async () => {
      const created = await createEntry();
      const res = await authed.patch(`${ENTRIES}/${created.galleryEntryId}`).send({});
      expect(res.status).toBe(400);
    });

    it('is a 404 for an id that does not exist', async () => {
      const res = await authed.patch(`${ENTRIES}/${newId()}`).send({ title: 'Không có' });
      expect(res.status).toBe(404);
    });
  });

  describe('list', () => {
    /** A private ordering island, far from every other test's entries. */
    const BASE_ORDER = 900_000;

    async function seedOrdered(): Promise<readonly string[]> {
      const ids: string[] = [];
      for (const offset of [0, 1, 2]) {
        const entry = await createEntry({ displayOrder: BASE_ORDER + offset });
        ids.push(entry.galleryEntryId);
      }
      return ids;
    }

    function islandOf(page: ListPayload, ids: readonly string[]): string[] {
      return page.items
        .filter((item) => ids.includes(item.galleryEntryId))
        .map((item) => item.galleryEntryId);
    }

    it('orders by display_order ascending and resumes across a cursor', async () => {
      const ids = await seedOrdered();

      const first = await authed.get(
        `${ENTRIES}?limit=1&cursor=${encodeCursorFor(BASE_ORDER - 1)}`,
      );
      expect(first.status).toBe(200);
      const firstPage = (first.body as Envelope<ListPayload>).data;
      expect(islandOf(firstPage, ids)).toEqual([ids[0]]);
      expect(firstPage.hasNext).toBe(true);
      expect(firstPage.nextCursor).toBeDefined();

      const second = await authed.get(
        `${ENTRIES}?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor as string)}`,
      );
      const secondPage = (second.body as Envelope<ListPayload>).data;
      expect(islandOf(secondPage, ids)).toEqual([ids[1], ids[2]]);
    });

    it('filters by lifecycle status', async () => {
      const created = await createEntry();

      const drafts = await authed.get(`${ENTRIES}?status=DRAFT&limit=100`);
      const published = await authed.get(`${ENTRIES}?status=PUBLISHED&limit=100`);

      const draftIds = (drafts.body as Envelope<ListPayload>).data.items.map(
        (item) => item.galleryEntryId,
      );
      const publishedIds = (published.body as Envelope<ListPayload>).data.items.map(
        (item) => item.galleryEntryId,
      );
      expect(draftIds).toContain(created.galleryEntryId);
      expect(publishedIds).not.toContain(created.galleryEntryId);
    });

    it('rejects a malformed cursor rather than restarting the page', async () => {
      const res = await authed.get(`${ENTRIES}?cursor=not-a-cursor`);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, code: 'GALLERY_ENTRY_CURSOR_INVALID' });
    });

    it('carries the summary the Admin list needs, and no media address', async () => {
      const created = await createEntry({ displayOrder: BASE_ORDER + 50 });

      const res = await authed.get(`${ENTRIES}?limit=100`);
      const row = (res.body as Envelope<ListPayload>).data.items.find(
        (item) => item.galleryEntryId === created.galleryEntryId,
      );

      expect(row).toBeDefined();
      expect(row).toMatchObject({
        title: created.title,
        slug: created.slug,
        status: 'DRAFT',
        displayOrder: BASE_ORDER + 50,
        isIndexable: true,
        assetCount: 0,
      });
      expect(JSON.stringify(row)).not.toMatch(/storageKey|url|altText/i);
    });
  });
});

/** Builds the cursor a previous page would have published at `displayOrder`. */
function encodeCursorFor(displayOrder: number): string {
  const payload = JSON.stringify([String(displayOrder), '00000000-0000-0000-0000-000000000000']);
  return encodeURIComponent(Buffer.from(payload, 'utf8').toString('base64url'));
}
