/**
 * `APP12-M01.DB1` over HTTP — the 20-image cap on the existing Admin write.
 *
 * The whole stack runs: guards, the Zod pipe that now publishes `maxItems`, the
 * service that refuses the count, the transaction that replaces the selection
 * and the table whose constraints back all of it.
 *
 * What is asserted here and nowhere else is that the two bounds agree at the
 * wire. The DTO and the domain both cap the selection, deliberately — the DTO
 * so a client reading the schema knows the limit, the domain so the limit holds
 * for every caller, including one that never passes through this DTO. Over
 * HTTP the DTO is reached first, so the refusal a browser sees is the
 * platform's validation envelope naming `mediaAssetIds`; the domain's
 * `PRODUCT_MEDIA_TOO_MANY` is the backstop behind it, proved in
 * `product-media-selection.service.spec.ts`. Both are asserted, neither is
 * assumed.
 *
 * Everything runs against a disposable database. Nothing here touches shared
 * development data.
 */
import { sql } from 'drizzle-orm';
import { MAX_PRODUCT_MEDIA_ITEMS, newId } from '@embroidery/database';

import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const EMAIL = 'media-cap@example.test';
const PASSWORD = 'operator-secret-123';

interface Envelope<T> {
  readonly data: T;
}

interface ProductPayload {
  readonly productId: string;
  readonly updatedAt: string;
  readonly media: { assetId: string; role: string; position: number }[];
}

describe('Admin product media cap (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let cookie: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app12m01db1-media-cap');
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

  async function seedAssets(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push(await seedAcceptedAsset());
    }
    return ids;
  }

  async function createProduct(name: string): Promise<ProductPayload> {
    const res = await authed.post('/api/admin/products').send({ categorySlug: 'thu-bong', name });
    expect(res.status).toBe(201);
    return (res.body as Envelope<ProductPayload>).data;
  }

  async function storedMedia(
    productId: string,
  ): Promise<{ asset_id: string; role: string; display_order: number }[]> {
    const { rows } = await ctx.database.client.db.execute<{
      asset_id: string;
      role: string;
      display_order: number;
    }>(sql`
      select asset_id, role, display_order from product_media
      where product_id = ${productId} order by display_order
    `);
    return rows.map((row) => ({ ...row, display_order: Number(row.display_order) }));
  }

  it(`accepts exactly ${MAX_PRODUCT_MEDIA_ITEMS} images and stores them 0..N-1`, async () => {
    const product = await createProduct('Thú bông đủ ảnh');
    const assetIds = await seedAssets(MAX_PRODUCT_MEDIA_ITEMS);

    const res = await authed
      .patch(`/api/admin/products/${product.productId}`)
      .send({ expectedUpdatedAt: product.updatedAt, mediaAssetIds: assetIds });
    expect(res.status).toBe(200);

    const stored = await storedMedia(product.productId);
    expect(stored).toHaveLength(MAX_PRODUCT_MEDIA_ITEMS);
    expect(stored.map((row) => row.asset_id)).toEqual(assetIds);
    expect(stored.map((row) => row.display_order)).toEqual(
      Array.from({ length: MAX_PRODUCT_MEDIA_ITEMS }, (_, index) => index),
    );
    expect(stored.filter((row) => row.role === 'THUMBNAIL')).toEqual([
      { asset_id: assetIds[0], role: 'THUMBNAIL', display_order: 0 },
    ]);
  }, 120_000);

  it(`refuses ${MAX_PRODUCT_MEDIA_ITEMS + 1} images and writes nothing`, async () => {
    const product = await createProduct('Thú bông quá nhiều ảnh');
    const assetIds = await seedAssets(MAX_PRODUCT_MEDIA_ITEMS + 1);

    const res = await authed
      .patch(`/api/admin/products/${product.productId}`)
      .send({ expectedUpdatedAt: product.updatedAt, mediaAssetIds: assetIds });

    expect(res.status).toBe(400);
    // The published `maxItems` is reached first, so the wire answer is the
    // platform's canonical validation refusal naming the offending field —
    // asserted rather than assumed, because a bare 400 would also be produced
    // by half a dozen unrelated faults.
    expect(res.body).toMatchObject({
      success: false,
      errors: [{ field: 'mediaAssetIds', code: 'TOO_LONG' }],
    });
    expect(await storedMedia(product.productId)).toEqual([]);
  }, 120_000);

  it('leaves the previous selection untouched when an over-long patch is refused', async () => {
    // The refusal must be atomic against an existing gallery, not merely
    // against an empty one: the Admin write replaces the whole selection, so a
    // partial application would delete real media and store nothing.
    const product = await createProduct('Thú bông giữ nguyên ảnh cũ');
    const original = await seedAssets(3);

    const first = await authed
      .patch(`/api/admin/products/${product.productId}`)
      .send({ expectedUpdatedAt: product.updatedAt, mediaAssetIds: original });
    expect(first.status).toBe(200);
    const beforeRefusal = await storedMedia(product.productId);
    expect(beforeRefusal).toHaveLength(3);

    const current = (await authed.get(`/api/admin/products/${product.productId}`))
      .body as Envelope<ProductPayload>;

    const refused = await authed.patch(`/api/admin/products/${product.productId}`).send({
      expectedUpdatedAt: current.data.updatedAt,
      mediaAssetIds: await seedAssets(MAX_PRODUCT_MEDIA_ITEMS + 1),
    });
    expect(refused.status).toBe(400);
    expect(await storedMedia(product.productId)).toEqual(beforeRefusal);
  }, 180_000);

  it('still refuses a stale media update with the existing concurrency token', async () => {
    // `APP12-M01.DB1` adds a bound, not a new write path. The optimistic token
    // that guarded the media patch before must still guard it, and a losing
    // patch must leave the stored selection exactly as the winner wrote it.
    const product = await createProduct('Thú bông tranh chấp ảnh');
    const winner = await seedAssets(2);
    const loser = await seedAssets(2);

    const first = await authed
      .patch(`/api/admin/products/${product.productId}`)
      .send({ expectedUpdatedAt: product.updatedAt, mediaAssetIds: winner });
    expect(first.status).toBe(200);
    const afterWinner = await storedMedia(product.productId);

    // The same token again — now stale, because the winner moved `updatedAt`.
    const stale = await authed
      .patch(`/api/admin/products/${product.productId}`)
      .send({ expectedUpdatedAt: product.updatedAt, mediaAssetIds: loser });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'PRODUCT_VERSION_CONFLICT' });
    expect(await storedMedia(product.productId)).toEqual(afterWinner);
  }, 180_000);
});
