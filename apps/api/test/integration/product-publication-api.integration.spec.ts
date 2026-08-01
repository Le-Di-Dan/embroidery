/**
 * `APP2-B03` over HTTP — the three publication operations end to end.
 *
 * The whole stack runs: the authenticated-Admin guard, the Origin and JSON body
 * guards, the Zod validation pipe, the response envelope and the exception
 * filter. What is asserted here and nowhere else is the wire contract — status
 * codes, envelope shape, strict validation, and the facts a browser must never
 * receive.
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
const FOREIGN_ORIGIN = 'http://evil.example.test';
const EMAIL = 'publication-http@example.test';
/** Synthetic. No real credential ever appears in a fixture. */
const PASSWORD = 'operator-secret-123';

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
  readonly errors?: { field: string; code: string; message: string }[];
  readonly meta: { readonly requestId: string; readonly timestamp: string };
}

interface ReadinessPayload {
  readonly productId: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly eligible: boolean;
  readonly requirements: { code: string; satisfied: boolean }[];
}

interface PublicationPayload {
  readonly productId: string;
  readonly slug: string;
  readonly status: string;
  readonly updatedAt: string;
}

describe('Admin product publication HTTP flow (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;
  let seedCounter = 0;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app2b03-publication-http');
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

  async function seedAsset(): Promise<string> {
    const id = newId();
    await ctx.database.client.db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
              ${`development/originals/${id}/original.png`}, 'image/png', 51200,
              ${`sha256:${'b'.repeat(64)}`}, 'ACCEPTED')
    `);
    for (const kind of ['THUMBNAIL', 'CATALOG_PREVIEW']) {
      await ctx.database.client.db.execute(sql`
        insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked)
        values (${newId()}, ${id}, ${kind}, 'READY',
                ${`development/derivatives/${id}/${kind}.webp`}, false)
      `);
    }
    return id;
  }

  /** A draft over HTTP, publishable unless `complete` is false. */
  async function createProduct(complete = true): Promise<PublicationPayload> {
    seedCounter += 1;
    const created = await authed.post('/api/admin/products').send({
      categorySlug: 'thu-bong',
      name: `Sản phẩm xuất bản ${seedCounter}-${newId().slice(-6)}`,
      ...(complete ? { description: 'Mô tả đầy đủ.' } : {}),
    });
    expect(created.status).toBe(201);
    const draft = (created.body as Envelope<PublicationPayload>).data;
    if (!complete) {
      return draft;
    }

    const patched = await authed.patch(`/api/admin/products/${draft.productId}`).send({
      expectedUpdatedAt: draft.updatedAt,
      basePriceAmount: '250000',
      mediaAssetIds: [await seedAsset()],
    });
    expect(patched.status).toBe(200);
    return (patched.body as Envelope<PublicationPayload>).data;
  }

  describe('runtime registration and envelope', () => {
    it('serves readiness in the canonical success envelope', async () => {
      const product = await createProduct();
      const res = await authed.get(
        `/api/admin/products/${product.productId}/publication-readiness`,
      );

      expect(res.status).toBe(200);
      const body = res.body as Envelope<ReadinessPayload>;
      expect(body.success).toBe(true);
      expect(body.code).toBe('PRODUCT_PUBLICATION_READINESS_READ');
      expect(typeof body.meta.requestId).toBe('string');
      expect(body.meta.requestId.length).toBeGreaterThan(0);
      expect(body.data.eligible).toBe(true);
      expect(body.data.requirements).toHaveLength(7);
    });

    it('publishes and unpublishes with their own success codes', async () => {
      const product = await createProduct();
      const published = await authed
        .post(`/api/admin/products/${product.productId}/publish`)
        .send({ expectedUpdatedAt: product.updatedAt });

      expect(published.status).toBe(200);
      const publishedBody = published.body as Envelope<PublicationPayload>;
      expect(publishedBody.code).toBe('PRODUCT_PUBLISHED');
      expect(publishedBody.data.status).toBe('PUBLISHED');

      const unpublished = await authed
        .post(`/api/admin/products/${product.productId}/unpublish`)
        .send({ expectedUpdatedAt: publishedBody.data.updatedAt });

      expect(unpublished.status).toBe(200);
      const unpublishedBody = unpublished.body as Envelope<PublicationPayload>;
      expect(unpublishedBody.code).toBe('PRODUCT_UNPUBLISHED');
      expect(unpublishedBody.data.status).toBe('DRAFT');
    });

    it('publishes exactly the documented fields and no internal fact', async () => {
      const product = await createProduct();
      const res = await authed.get(
        `/api/admin/products/${product.productId}/publication-readiness`,
      );
      const body = res.body as Envelope<ReadinessPayload>;

      expect(Object.keys(body.data).sort()).toEqual([
        'eligible',
        'productId',
        'requirements',
        'status',
        'updatedAt',
      ]);
      const serialized = JSON.stringify(body);
      for (const leak of ['storage_key', 'storageKey', 'checksum', 'categoryId', 'bucket']) {
        expect(serialized).not.toContain(leak);
      }
    });
  });

  describe('guards', () => {
    it('refuses every operation without a live Admin session', async () => {
      const product = await createProduct();
      const calls: (() => Promise<{ status: number; body: unknown }>)[] = [
        () => ctx.http.get(`/api/admin/products/${product.productId}/publication-readiness`),
        () =>
          ctx.http
            .post(`/api/admin/products/${product.productId}/publish`)
            .set('Origin', ADMIN_ORIGIN)
            .send({ expectedUpdatedAt: product.updatedAt }),
        () =>
          ctx.http
            .post(`/api/admin/products/${product.productId}/unpublish`)
            .set('Origin', ADMIN_ORIGIN)
            .send({ expectedUpdatedAt: product.updatedAt }),
      ];

      for (const call of calls) {
        const res = await call();
        expect(res.status).toBe(401);
        expect((res.body as Envelope<unknown>).success).toBe(false);
      }
    });

    it('refuses a mutation from an origin outside the Admin allowlist', async () => {
      const product = await createProduct();
      for (const action of ['publish', 'unpublish']) {
        const res = await ctx.http
          .post(`/api/admin/products/${product.productId}/${action}`)
          .set('Cookie', cookie)
          .set('Origin', FOREIGN_ORIGIN)
          .send({ expectedUpdatedAt: product.updatedAt });
        expect(res.status).toBe(403);
      }
    });

    it('refuses a body that is not application/json', async () => {
      const product = await createProduct();
      const res = await ctx.http
        .post(`/api/admin/products/${product.productId}/publish`)
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('expectedUpdatedAt=whenever');
      expect(res.status).toBe(415);
    });
  });

  describe('strict validation', () => {
    it('rejects a missing or malformed token', async () => {
      const product = await createProduct();
      for (const body of [{}, { expectedUpdatedAt: 'yesterday' }]) {
        const res = await authed
          .post(`/api/admin/products/${product.productId}/publish`)
          .send(body);
        expect(res.status).toBe(400);
      }
    });

    it('rejects an unknown field rather than dropping it', async () => {
      const product = await createProduct();
      const res = await authed.post(`/api/admin/products/${product.productId}/publish`).send({
        expectedUpdatedAt: product.updatedAt,
        status: 'PUBLISHED',
      });
      expect(res.status).toBe(400);
    });

    it('rejects a product id that is not a UUID', async () => {
      const res = await authed.get('/api/admin/products/not-a-uuid/publication-readiness');
      expect(res.status).toBe(400);
    });
  });

  describe('safe errors', () => {
    it('reports an unknown product as a 404 that reveals nothing', async () => {
      const res = await authed.get(`/api/admin/products/${newId()}/publication-readiness`);
      expect(res.status).toBe(404);
      const body = res.body as Envelope<unknown>;
      expect(body.code).toBe('PRODUCT_NOT_FOUND');
      expect(body.message).not.toMatch(/select|from|products|constraint/i);
    });

    it('reports a stale token as a distinct 409', async () => {
      const product = await createProduct();
      await authed
        .post(`/api/admin/products/${product.productId}/publish`)
        .send({ expectedUpdatedAt: product.updatedAt });

      const res = await authed
        .post(`/api/admin/products/${product.productId}/unpublish`)
        .send({ expectedUpdatedAt: product.updatedAt });
      expect(res.status).toBe(409);
      expect((res.body as Envelope<unknown>).code).toBe('PRODUCT_VERSION_CONFLICT');
    });

    it('reports an unmet requirement as its own 409 with structured codes', async () => {
      const draft = await createProduct(false);
      const res = await authed
        .post(`/api/admin/products/${draft.productId}/publish`)
        .send({ expectedUpdatedAt: draft.updatedAt });

      expect(res.status).toBe(409);
      const body = res.body as Envelope<unknown>;
      expect(body.code).toBe('PRODUCT_PUBLICATION_NOT_READY');
      // A bare draft is missing three facts at once, and all three codes must
      // survive the platform mapper — a client that received only the first
      // would send the operator back three times.
      expect(body.errors?.map((entry) => entry.code)).toEqual([
        'PRODUCT_DESCRIPTION_READY',
        'PRODUCT_PRICE_READY',
        'PRODUCT_MEDIA_READY',
      ]);
      expect(body.message).not.toMatch(/select|constraint|null value/i);
    });

    it('distinguishes a wrong lifecycle state from a stale token', async () => {
      const product = await createProduct();
      const res = await authed
        .post(`/api/admin/products/${product.productId}/unpublish`)
        .send({ expectedUpdatedAt: product.updatedAt });

      // A current token against a state that forbids the transition: the state
      // is the honest answer, and it must not be reported as a conflict.
      expect(res.status).toBe(409);
      expect((res.body as Envelope<unknown>).code).toBe('PRODUCT_UNPUBLISH_NOT_ALLOWED');
    });
  });
});
