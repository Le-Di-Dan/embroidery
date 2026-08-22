/**
 * `APP7-B01` over HTTP — the two Admin SKU operations end to end.
 *
 * The whole stack runs: the Admin session guard, the Origin allowlist, the
 * JSON-only guard, the Zod validation pipe, the response envelope and the
 * exception filter. What is asserted here and nowhere else is the wire
 * contract — status codes, envelope shape, strict validation, and the fact that
 * neither route is reachable without the complete Admin mutation chain.
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
const EMAIL = 'sku@example.test';
const PASSWORD = 'operator-secret-123';
const CATEGORY_ID = '019a0000-0000-7000-8000-000000000001';

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
}

interface SkuPayload {
  readonly skuId: string;
  readonly productId: string;
  readonly productVariantId: string;
  readonly code: string;
  readonly priceOverrideAmount?: string;
  readonly currencyCode: string;
  readonly isActive: boolean;
  readonly variantOrderEligibleSkuCount: number;
}

describe('Admin SKU HTTP flow (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app7b01-sku-http');
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
    post: (path: string) => ctx.http.post(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
    patch: (path: string) => ctx.http.patch(path).set('Cookie', cookie).set('Origin', ADMIN_ORIGIN),
  };

  /** The seeded category survives across tests; the database is not reset here. */
  async function seedVariant(status = 'PUBLISHED'): Promise<{
    productId: string;
    variantId: string;
  }> {
    const db = ctx.database.client.db;
    const productId = newId();
    await db.execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${CATEGORY_ID}, 'Thú bông gấu nâu', ${`sku-http-${productId}`},
              '250000', 'VND', ${status}, false, 0, true)
    `);
    const variantId = newId();
    await db.execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${variantId}, ${productId}, 'Nâu', 'M', 0, true)
    `);
    return { productId, variantId };
  }

  const skusPath = (productId: string, variantId: string) =>
    `/api/admin/products/${productId}/variants/${variantId}/skus`;

  async function createSku(
    code: string,
    isActive = true,
  ): Promise<{ sku: SkuPayload; productId: string; variantId: string }> {
    const seeded = await seedVariant();
    const res = await authed
      .post(skusPath(seeded.productId, seeded.variantId))
      .send({ code, isActive });
    expect(res.status).toBe(201);
    return { sku: (res.body as Envelope<SkuPayload>).data, ...seeded };
  }

  describe('the wire contract', () => {
    it('creates a SKU and answers 201 in the standard envelope', async () => {
      const seeded = await seedVariant();
      const res = await authed
        .post(skusPath(seeded.productId, seeded.variantId))
        .send({
          code: `HTTP-${newId().slice(0, 8)}`,
          priceOverrideAmount: '260000',
          isActive: true,
        });

      expect(res.status).toBe(201);
      const envelope = res.body as Envelope<SkuPayload>;
      expect(envelope.success).toBe(true);
      expect(envelope.code).toBe('SKU_CREATED');
      expect(envelope.data.productVariantId).toBe(seeded.variantId);
      expect(envelope.data.variantOrderEligibleSkuCount).toBe(1);
      expect(envelope.data.currencyCode).toBe('VND');
    });

    it('patches a SKU and answers 200', async () => {
      const created = await createSku(`HTTP-P-${newId().slice(0, 8)}`);
      const res = await authed
        .patch(`/api/admin/skus/${created.sku.skuId}`)
        .send({ isActive: false, priceOverrideAmount: null });

      expect(res.status).toBe(200);
      const envelope = res.body as Envelope<SkuPayload>;
      expect(envelope.code).toBe('SKU_UPDATED');
      expect(envelope.data.isActive).toBe(false);
      expect(envelope.data.priceOverrideAmount).toBeUndefined();
      expect(envelope.data.variantOrderEligibleSkuCount).toBe(0);
    });

    it('publishes no stock, storage or inventory field', async () => {
      const created = await createSku(`HTTP-F-${newId().slice(0, 8)}`);
      expect(Object.keys(created.sku).sort()).toEqual([
        'code',
        'createdAt',
        'currencyCode',
        'isActive',
        'productId',
        'productVariantId',
        'skuId',
        'updatedAt',
        'variantOrderEligibleSkuCount',
      ]);
    });
  });

  describe('the Admin mutation chain', () => {
    it('refuses both operations without a live Admin session', async () => {
      const created = await createSku(`HTTP-A-${newId().slice(0, 8)}`);
      const calls = [
        () =>
          ctx.http
            .post(skusPath(created.productId, created.variantId))
            .set('Origin', ADMIN_ORIGIN)
            .send({ code: 'HTTP-NOAUTH', isActive: true }),
        () =>
          ctx.http
            .patch(`/api/admin/skus/${created.sku.skuId}`)
            .set('Origin', ADMIN_ORIGIN)
            .send({ isActive: false }),
      ];
      for (const call of calls) {
        expect((await call()).status).toBe(401);
      }
    });

    it('refuses an origin outside the Admin allowlist', async () => {
      const created = await createSku(`HTTP-O-${newId().slice(0, 8)}`);
      const res = await ctx.http
        .patch(`/api/admin/skus/${created.sku.skuId}`)
        .set('Cookie', cookie)
        .set('Origin', 'http://evil.example')
        .send({ isActive: false });
      expect(res.status).toBe(403);
    });

    it('refuses a body that is not application/json', async () => {
      const created = await createSku(`HTTP-C-${newId().slice(0, 8)}`);
      const res = await ctx.http
        .patch(`/api/admin/skus/${created.sku.skuId}`)
        .set('Cookie', cookie)
        .set('Origin', ADMIN_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('isActive=false');
      expect(res.status).toBe(415);
    });
  });

  describe('validation', () => {
    it('rejects an unknown field rather than dropping it', async () => {
      const seeded = await seedVariant();
      const res = await authed
        .post(skusPath(seeded.productId, seeded.variantId))
        .send({ code: 'HTTP-STRICT', isActive: true, quantityOnHand: 5 });
      expect(res.status).toBe(400);
    });

    it('rejects a body with no field to change', async () => {
      const created = await createSku(`HTTP-E-${newId().slice(0, 8)}`);
      const res = await authed.patch(`/api/admin/skus/${created.sku.skuId}`).send({});
      expect(res.status).toBe(400);
    });

    it('rejects a non-uuid path parameter before any lock is taken', async () => {
      const res = await authed.patch('/api/admin/skus/not-a-uuid').send({ isActive: false });
      expect(res.status).toBe(400);
    });
  });

  describe('refusals', () => {
    it('answers 404 for a variant that belongs to another product', async () => {
      const first = await seedVariant();
      const second = await seedVariant();
      const res = await authed
        .post(skusPath(first.productId, second.variantId))
        .send({ code: 'HTTP-MISMATCH', isActive: true });

      expect(res.status).toBe(404);
      expect((res.body as { code: string }).code).toBe('SKU_VARIANT_PRODUCT_MISMATCH');
    });

    it('answers 404 for an unknown SKU', async () => {
      const res = await authed.patch(`/api/admin/skus/${newId()}`).send({ isActive: false });
      expect(res.status).toBe(404);
      expect((res.body as { code: string }).code).toBe('SKU_NOT_FOUND');
    });

    it('answers 409 for a duplicate code, with no database detail', async () => {
      const created = await createSku(`HTTP-D-${newId().slice(0, 8)}`);
      const other = await seedVariant();
      const res = await authed
        .post(skusPath(other.productId, other.variantId))
        .send({ code: created.sku.code, isActive: false });

      expect(res.status).toBe(409);
      const body = res.body as { code: string; message: string };
      expect(body.code).toBe('SKU_CODE_CONFLICT');
      expect(JSON.stringify(res.body)).not.toMatch(/23505|uq_skus|constraint|pg_/i);
    });

    it('answers 409 when the write would leave an ambiguous eligible set', async () => {
      const created = await createSku(`HTTP-AMB-${newId().slice(0, 8)}`);
      const res = await authed
        .post(skusPath(created.productId, created.variantId))
        .send({ code: `HTTP-AMB2-${newId().slice(0, 8)}`, isActive: true });

      expect(res.status).toBe(409);
      expect((res.body as { code: string }).code).toBe('SKU_ORDER_ELIGIBLE_AMBIGUOUS');
    });

    it('answers 409 on an ARCHIVED product', async () => {
      const seeded = await seedVariant('ARCHIVED');
      const res = await authed
        .post(skusPath(seeded.productId, seeded.variantId))
        .send({ code: `HTTP-ARC-${newId().slice(0, 8)}`, isActive: true });

      expect(res.status).toBe(409);
      expect((res.body as { code: string }).code).toBe('SKU_PRODUCT_NOT_AUTHORABLE');
    });
  });
});
