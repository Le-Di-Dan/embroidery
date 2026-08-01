/**
 * `APP2-B02` over HTTP — the five Admin product operations end to end.
 *
 * The whole stack runs: guards, the Zod validation pipe, the response envelope
 * and the exception filter. What is asserted here and nowhere else is the wire
 * contract — status codes, envelope shape, strict validation, and the fields a
 * browser must never receive.
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
const EMAIL = 'catalog@example.test';
const PASSWORD = 'operator-secret-123';

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
  readonly meta: { readonly requestId: string; readonly timestamp: string };
}

interface ProductPayload {
  readonly productId: string;
  readonly slug: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly basePriceAmount: string;
  readonly category: { slug: string; name: string };
  readonly media: { assetId: string; role: string; position: number }[];
}

describe('Admin product HTTP flow (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app2b02-product-http');
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
    // The same explicit budget as the setup: under the full `pnpm quality` run
    // every package competes for one PostgreSQL server, and a teardown that
    // outran the default hook timeout would fail a suite whose assertions all
    // passed.
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

  async function seedAcceptedAsset(): Promise<string> {
    const id = newId();
    await ctx.database.client.db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
              ${`development/originals/${id}/original.png`}, 'image/png', 51200,
              ${`sha256:${'b'.repeat(64)}`}, 'ACCEPTED')
    `);
    return id;
  }

  const authed = {
    get: (path: string) => ctx.http.get(path).set('Cookie', cookie),
    post: (path: string) => ctx.http.post(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
    patch: (path: string) => ctx.http.patch(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
  };

  async function createProduct(name: string, categorySlug = 'thu-bong'): Promise<ProductPayload> {
    const res = await authed.post('/api/admin/products').send({ categorySlug, name });
    expect(res.status).toBe(201);
    return (res.body as Envelope<ProductPayload>).data;
  }

  describe('authentication', () => {
    it('refuses every operation without a live Admin session', async () => {
      const product = await createProduct('Thú bông kiểm tra quyền');
      // Built lazily: supertest binds an ephemeral server per request, so
      // creating them all up front leaves the earliest ones closed by the time
      // the last is awaited.
      const calls: (() => Promise<{ status: number; body: unknown }>)[] = [
        () => ctx.http.get('/api/admin/products'),
        () => ctx.http.get(`/api/admin/products/${product.productId}`),
        () =>
          ctx.http
            .post('/api/admin/products')
            .set('Origin', ADMIN_ORIGIN)
            .send({ categorySlug: 'khan', name: 'X' }),
        () =>
          ctx.http
            .patch(`/api/admin/products/${product.productId}`)
            .set('Origin', ADMIN_ORIGIN)
            .send({ expectedUpdatedAt: product.updatedAt, name: 'X' }),
        () =>
          ctx.http
            .post(`/api/admin/products/${product.productId}/archive`)
            .set('Origin', ADMIN_ORIGIN)
            .send({ expectedUpdatedAt: product.updatedAt }),
      ];

      for (const call of calls) {
        const res = await call();
        expect(res.status).toBe(401);
        expect((res.body as Envelope<unknown>).success).toBe(false);
      }
    });
  });

  describe('create', () => {
    it('returns 201 in the canonical envelope with the request id', async () => {
      const res = await authed
        .post('/api/admin/products')
        .send({ categorySlug: 'thu-bong', name: 'Gấu bông nâu' });

      expect(res.status).toBe(201);
      const body = res.body as Envelope<ProductPayload>;
      expect(body).toMatchObject({
        success: true,
        code: 'PRODUCT_DRAFT_CREATED',
        data: { status: 'DRAFT', slug: 'gau-bong-nau', basePriceAmount: '0' },
      });
      expect(body.meta.requestId).toEqual(expect.any(String));
      expect(body.meta.timestamp).toEqual(expect.any(String));
    });

    it('rejects an unknown body field and an unknown category', async () => {
      const unknownField = await authed
        .post('/api/admin/products')
        .send({ categorySlug: 'khan', name: 'X', slug: 'chosen-by-client' });
      expect(unknownField.status).toBe(400);

      const unknownCategory = await authed
        .post('/api/admin/products')
        .send({ categorySlug: 'do-choi', name: 'X' });
      expect(unknownCategory.status).toBe(400);
    });
  });

  describe('list and detail', () => {
    it('pages with an opaque cursor and never exposes an offset or total', async () => {
      for (const name of ['Khăn A', 'Khăn B']) {
        await createProduct(name, 'khan');
      }

      const res = await authed.get('/api/admin/products?limit=1&status=DRAFT');
      expect(res.status).toBe(200);
      const page = (
        res.body as Envelope<{ items: unknown[]; nextCursor?: string; hasNext: boolean }>
      ).data;
      expect(page.items).toHaveLength(1);
      expect(page.hasNext).toBe(true);
      expect(page.nextCursor).toEqual(expect.any(String));
      expect(JSON.stringify(page)).not.toMatch(/"total"|"offset"|"page"/);

      const next = await authed.get(
        `/api/admin/products?limit=1&status=DRAFT&cursor=${encodeURIComponent(page.nextCursor as string)}`,
      );
      expect(next.status).toBe(200);
    });

    it('rejects an unknown query parameter and a malformed cursor', async () => {
      expect((await authed.get('/api/admin/products?offset=10')).status).toBe(400);
      expect((await authed.get('/api/admin/products?search=gau')).status).toBe(400);
      expect((await authed.get('/api/admin/products?limit=0')).status).toBe(400);
      expect((await authed.get('/api/admin/products?cursor=broken')).status).toBe(400);
    });

    it('returns 200 for a product and a safe 404 for an unknown id', async () => {
      const product = await createProduct('Thú bông chi tiết');
      const found = await authed.get(`/api/admin/products/${product.productId}`);
      expect(found.status).toBe(200);
      expect((found.body as Envelope<ProductPayload>).code).toBe('PRODUCT_DETAIL_READ');

      const missing = await authed.get(`/api/admin/products/${newId()}`);
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({ success: false, code: 'PRODUCT_NOT_FOUND' });

      expect((await authed.get('/api/admin/products/not-a-uuid')).status).toBe(400);
    });

    it('exposes safe media identity and no storage, URL or internal field', async () => {
      const product = await createProduct('Thú bông có ảnh HTTP');
      const assetId = await seedAcceptedAsset();
      await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: product.updatedAt, mediaAssetIds: [assetId] })
        .expect(200);

      const res = await authed.get(`/api/admin/products/${product.productId}`);
      const payload = (res.body as Envelope<ProductPayload>).data;
      expect(payload.media).toEqual([
        expect.objectContaining({ assetId, role: 'THUMBNAIL', position: 0 }),
      ]);

      const serialized = JSON.stringify(res.body).toLowerCase();
      for (const forbidden of [
        'thumbnailurl',
        'storagekey',
        'storage_key',
        'bucket',
        'minio',
        'checksum',
        'sha256',
        'categoryid',
        'isindexable',
        'seotitle',
        'derivative',
      ]) {
        expect({ forbidden, present: serialized.includes(forbidden) }).toEqual({
          forbidden,
          present: false,
        });
      }
    });
  });

  describe('update', () => {
    it('returns 200 on a valid patch and 409 on a stale token', async () => {
      const product = await createProduct('Thú bông cập nhật');

      const ok = await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: product.updatedAt, name: 'Thú bông đã đổi tên' });
      expect(ok.status).toBe(200);
      // The slug is server-owned: a rename never moves the public address.
      expect((ok.body as Envelope<ProductPayload>).data.slug).toBe(product.slug);

      const stale = await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: product.updatedAt, name: 'Ghi đè' });
      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({ code: 'PRODUCT_VERSION_CONFLICT' });
    });

    it('rejects an empty patch, an unknown field and a numeric price', async () => {
      const product = await createProduct('Thú bông kiểm tra body');
      const at = product.updatedAt;

      for (const body of [
        { expectedUpdatedAt: at },
        { expectedUpdatedAt: at, slug: 'x' },
        { expectedUpdatedAt: at, status: 'PUBLISHED' },
        { expectedUpdatedAt: at, basePriceAmount: 250_000 },
        { expectedUpdatedAt: at, basePriceAmount: '250000.50' },
        { name: 'no token' },
      ]) {
        const res = await authed.patch(`/api/admin/products/${product.productId}`).send(body);
        expect({ body, status: res.status }).toEqual({ body, status: 400 });
      }
    });

    it('reports an unusable image as a conflict and a missing one as invalid', async () => {
      const product = await createProduct('Thú bông ảnh lỗi');
      const pendingId = newId();
      await ctx.database.client.db.execute(sql`
        insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
        values (${pendingId}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
                ${`development/originals/${pendingId}/original.png`}, 'image/png', 4096,
                ${`sha256:${'c'.repeat(64)}`}, 'INSPECTING')
      `);

      const unavailable = await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: product.updatedAt, mediaAssetIds: [pendingId] });
      expect(unavailable.status).toBe(409);
      expect(unavailable.body).toMatchObject({ code: 'PRODUCT_MEDIA_ASSET_UNAVAILABLE' });

      const missing = await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: product.updatedAt, mediaAssetIds: [newId()] });
      expect(missing.status).toBe(400);
      expect(missing.body).toMatchObject({ code: 'PRODUCT_MEDIA_ASSET_NOT_FOUND' });
    });
  });

  describe('archive', () => {
    it('archives once and then reports a safe conflict', async () => {
      const product = await createProduct('Thú bông lưu trữ HTTP');

      const archived = await authed
        .post(`/api/admin/products/${product.productId}/archive`)
        .send({ expectedUpdatedAt: product.updatedAt });
      expect(archived.status).toBe(200);
      const payload = (archived.body as Envelope<ProductPayload>).data;
      expect(payload.status).toBe('ARCHIVED');
      expect((archived.body as Envelope<ProductPayload>).code).toBe('PRODUCT_ARCHIVED');

      const again = await authed
        .post(`/api/admin/products/${product.productId}/archive`)
        .send({ expectedUpdatedAt: payload.updatedAt });
      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({ code: 'PRODUCT_ARCHIVE_NOT_ALLOWED' });
    });

    it('is not a delete — the archived product is still readable', async () => {
      const product = await createProduct('Thú bông vẫn còn');
      await authed
        .post(`/api/admin/products/${product.productId}/archive`)
        .send({ expectedUpdatedAt: product.updatedAt })
        .expect(200);

      const detail = await authed.get(`/api/admin/products/${product.productId}`);
      expect(detail.status).toBe(200);
      expect((detail.body as Envelope<ProductPayload>).data.status).toBe('ARCHIVED');

      const listed = await authed.get('/api/admin/products?status=ARCHIVED&limit=100');
      const ids = (listed.body as Envelope<{ items: ProductPayload[] }>).data.items.map(
        (item) => item.productId,
      );
      expect(ids).toContain(product.productId);
    });

    it('rejects an archive without a concurrency token', async () => {
      const product = await createProduct('Thú bông thiếu token');
      const res = await authed.post(`/api/admin/products/${product.productId}/archive`).send({});
      expect(res.status).toBe(400);
    });
  });

  /**
   * `APP2-B02-C1` — the canonical mutation guards.
   *
   * B02 shipped `StaffOriginGuard` but not `StaffJsonBodyGuard`, so a
   * cross-site HTML form post was not rejected on content type. Both are the
   * existing APP1 implementations; nothing about Origin parsing, the allowlist
   * or content-type handling is re-implemented in the Catalog module.
   */
  describe('mutation protection', () => {
    /** One builder per mutation, so each case is exercised on all three. */
    function mutations(product: ProductPayload) {
      return [
        {
          name: 'create',
          send: () => ctx.http.post('/api/admin/products'),
          body: { categorySlug: 'khan', name: 'Bảo vệ' },
        },
        {
          name: 'update',
          send: () => ctx.http.patch(`/api/admin/products/${product.productId}`),
          body: { expectedUpdatedAt: product.updatedAt, name: 'Bảo vệ' },
        },
        {
          name: 'archive',
          send: () => ctx.http.post(`/api/admin/products/${product.productId}/archive`),
          body: { expectedUpdatedAt: product.updatedAt },
        },
      ];
    }

    it('accepts an authenticated same-origin JSON request', async () => {
      const product = await createProduct('Bảo vệ hợp lệ');
      const res = await ctx.http
        .patch(`/api/admin/products/${product.productId}`)
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ expectedUpdatedAt: product.updatedAt, name: 'Bảo vệ hợp lệ 2' });
      expect(res.status).toBe(200);
    });

    it('rejects a foreign or null Origin on every mutation with 403', async () => {
      const product = await createProduct('Bảo vệ nguồn lạ');
      for (const mutation of mutations(product)) {
        for (const origin of [
          'http://evil.example',
          'null',
          'http://admin.embroidery.local.evil',
        ]) {
          const res = await mutation
            .send()
            .set('Cookie', cookie)
            .set('Origin', origin)
            .send(mutation.body);
          expect({ mutation: mutation.name, origin, status: res.status }).toEqual({
            mutation: mutation.name,
            origin,
            status: 403,
          });
          expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
        }
      }
    });

    it('rejects a wrong content type on every mutation with 415', async () => {
      const product = await createProduct('Bảo vệ kiểu nội dung');
      for (const mutation of mutations(product)) {
        const res = await mutation
          .send()
          .set('Cookie', cookie)
          .set('Origin', ADMIN_ORIGIN)
          .set('Content-Type', 'text/plain')
          .send(JSON.stringify(mutation.body));
        expect({ mutation: mutation.name, status: res.status }).toEqual({
          mutation: mutation.name,
          status: 415,
        });
        expect(res.body).toMatchObject({ success: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
      }
    });

    /**
     * Recorded exactly as the canonical policy behaves, not as one might wish:
     * a request carrying **neither** `Origin` nor `Referer` is treated as
     * non-browser (server-to-server, CLI, test) and allowed — the SameSite
     * cookie plus the session are the control there. A browser cross-site
     * request always carries one and is refused above.
     */
    it('allows an absent Origin, which is the canonical non-browser case', async () => {
      const product = await createProduct('Bảo vệ không nguồn');
      const res = await ctx.http
        .patch(`/api/admin/products/${product.productId}`)
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json')
        .send({ expectedUpdatedAt: product.updatedAt, name: 'Không nguồn' });
      expect(res.status).toBe(200);
    });

    it('still answers 401 before any origin or content-type decision', async () => {
      const product = await createProduct('Bảo vệ chưa đăng nhập');
      for (const mutation of mutations(product)) {
        const res = await mutation
          .send()
          .set('Origin', 'http://evil.example')
          .set('Content-Type', 'text/plain')
          // A string, not an object: with a non-JSON content type superagent
          // measures the body itself and throws on anything else.
          .send(JSON.stringify(mutation.body));
        expect({ mutation: mutation.name, status: res.status }).toEqual({
          mutation: mutation.name,
          status: 401,
        });
      }
    });

    it('leaves the safe reads free of any mutation-only requirement', async () => {
      const product = await createProduct('Đọc an toàn');
      const list = await ctx.http.get('/api/admin/products?limit=1').set('Cookie', cookie);
      expect(list.status).toBe(200);
      const detail = await ctx.http
        .get(`/api/admin/products/${product.productId}`)
        .set('Cookie', cookie);
      expect(detail.status).toBe(200);
    });
  });

  describe('description contract', () => {
    it('clears on null or blank and leaves the value alone when omitted', async () => {
      const product = await createProduct('Mô tả hợp đồng');
      const withText = await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: product.updatedAt, description: 'Có mô tả' });
      expect(withText.status).toBe(200);
      let payload = (withText.body as Envelope<{ description?: string; updatedAt: string }>).data;
      expect(payload.description).toBe('Có mô tả');

      // Omitted: unchanged.
      const renamed = await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: payload.updatedAt, name: 'Đổi tên thôi' });
      payload = (renamed.body as Envelope<{ description?: string; updatedAt: string }>).data;
      expect(payload.description).toBe('Có mô tả');

      // Blank: cleared, exactly as null would.
      const blanked = await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: payload.updatedAt, description: '   ' });
      payload = (blanked.body as Envelope<{ description?: string; updatedAt: string }>).data;
      expect(payload.description).toBeUndefined();

      const restored = await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: payload.updatedAt, description: 'Lại có' });
      payload = (restored.body as Envelope<{ description?: string; updatedAt: string }>).data;
      const cleared = await authed
        .patch(`/api/admin/products/${product.productId}`)
        .send({ expectedUpdatedAt: payload.updatedAt, description: null });
      expect((cleared.body as Envelope<{ description?: string }>).data.description).toBeUndefined();
    });
  });

  describe('boundary', () => {
    it('exposes no unsanctioned product or category route', async () => {
      // `/api/public/products` was in this list until `APP2-B04` delivered it.
      // It is deliberately no longer here: the assertion that mattered was
      // "the Admin surface invents no public route", not "no public route may
      // ever exist". These two remain unrouted.
      for (const path of ['/api/products', '/api/admin/categories']) {
        const res = await ctx.http.get(path);
        expect({ path, status: res.status }).toEqual({ path, status: 404 });
      }
    });

    it('serves the sanctioned public catalog anonymously, with no Admin session', async () => {
      // No `authed` agent: this is the anonymous client. It proves the Admin
      // suite's own boundary — the public catalog is reachable without a staff
      // cookie, and it is the B04 operation rather than anything this module
      // exposes.
      const res = await ctx.http.get('/api/public/products');
      expect(res.status).toBe(200);
      expect((res.body as Envelope<unknown>).code).toBe('PUBLIC_PRODUCT_LIST_READ');
    });
  });

  // The Storefront browser route (`/san-pham/<slug>`, still an unresolved
  // proposal) is asserted absent at the layer that would actually serve it:
  // `tools/nginx-public-catalog-seam.test.mjs` proves no gateway template binds
  // it, and the development gateway smoke proves it does not answer. Asserting
  // it here would only exercise how this harness handles a path outside the
  // API's global prefix, which is unrelated platform behaviour.
});
