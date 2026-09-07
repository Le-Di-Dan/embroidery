/**
 * `APP12-M01.B2` over HTTP — published Product media curation end to end.
 *
 * The whole stack runs against a **disposable** PostgreSQL: the
 * authenticated-Admin guard, the Origin and JSON-body guards, the Zod pipe, the
 * use case, the transaction and the migration-0039 constraints behind it.
 * Nothing here touches the shared development database, and no `APP12-G03` data
 * is created.
 *
 * Two things are asserted that no unit test can reach. Every refusal is checked
 * against the **stored rows** rather than the response, because a partial write
 * would answer with an error and still have deleted the gallery; and every
 * refusal is checked against the **commercial columns**, because "media-only"
 * is a claim about what the transaction did not write.
 */
import {
  authed,
  commercialFacts,
  createDraft,
  createPublished,
  loginAdmin,
  seedAsset,
  seedAssets,
  storedMedia,
  storedMediaIds,
  ADMIN_ORIGIN,
  type Envelope,
  type ProductPayload,
} from '../support/product-media-curation-fixture';
import { MAX_PRODUCT_MEDIA_ITEMS, newId } from '@embroidery/database';

import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';

const EMAIL = 'media-curation@example.test';
/** Synthetic. No real credential ever appears in a fixture. */
const PASSWORD = 'operator-secret-123';

describe('Admin product media curation (APP12-M01.B2, integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let previousOrigins: string | undefined;
  let api: ReturnType<typeof authed>;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createApiIntegrationContext('app12m01b2-media-curation');
    await ctx.app.get(BootstrapStaffUseCase).bootstrap({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.app.get(LoginRateLimiter).reset();
    api = authed(ctx, await loginAdmin(ctx, EMAIL, PASSWORD));
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  }, 240_000);

  const replace = (product: ProductPayload, mediaAssetIds: readonly string[], token?: string) =>
    api
      .put(`/api/admin/products/${product.productId}/media`)
      .send({ expectedUpdatedAt: token ?? product.updatedAt, mediaAssetIds });

  const detailOf = async (productId: string): Promise<ProductPayload> =>
    ((await api.get(`/api/admin/products/${productId}`)).body as Envelope<ProductPayload>).data;

  // ---------------------------------------------------------------- §19/§21

  describe('published media curation', () => {
    it('reorders a published gallery without unpublishing it (journey 1)', async () => {
      const [a, b, c] = await seedAssets(ctx, 3);
      const product = await createPublished(api, 'Thú bông sắp xếp', [a!, b!, c!]);
      expect(product.status).toBe('PUBLISHED');

      const res = await replace(product, [a!, c!, b!]);
      expect(res.status).toBe(200);
      const body = res.body as Envelope<ProductPayload>;
      expect(body.code).toBe('PRODUCT_MEDIA_REPLACED');
      expect(body.data.status).toBe('PUBLISHED');
      expect(body.data.media.map((item) => item.assetId)).toEqual([a, c, b]);

      expect(await storedMedia(ctx, product.productId)).toEqual([
        { asset_id: a, role: 'THUMBNAIL', display_order: 0 },
        { asset_id: c, role: 'GALLERY', display_order: 1 },
        { asset_id: b, role: 'GALLERY', display_order: 2 },
      ]);
    }, 180_000);

    it('promotes a new stored primary when the first id changes (journey 2)', async () => {
      const [a, b, c] = await seedAssets(ctx, 3);
      const product = await createPublished(api, 'Thú bông đổi ảnh chính', [a!, b!, c!]);

      const res = await replace(product, [c!, a!, b!]);
      expect(res.status).toBe(200);

      // The stored primary moved — this is a write, not B1's read-side
      // effective-primary fallback.
      expect(await storedMedia(ctx, product.productId)).toEqual([
        { asset_id: c, role: 'THUMBNAIL', display_order: 0 },
        { asset_id: a, role: 'GALLERY', display_order: 1 },
        { asset_id: b, role: 'GALLERY', display_order: 2 },
      ]);
      expect((await detailOf(product.productId)).status).toBe('PUBLISHED');
    }, 180_000);

    it('promotes the first remaining image when the primary is removed (journey 3)', async () => {
      const [a, b, c] = await seedAssets(ctx, 3);
      const published = await createPublished(api, 'Thú bông bỏ ảnh chính', [c!, a!, b!]);

      const res = await replace(published, [a!, b!]);
      expect(res.status).toBe(200);
      expect(await storedMedia(ctx, published.productId)).toEqual([
        { asset_id: a, role: 'THUMBNAIL', display_order: 0 },
        { asset_id: b, role: 'GALLERY', display_order: 1 },
      ]);
    }, 180_000);

    it('accepts a single image and a full twenty', async () => {
      const one = await seedAsset(ctx);
      const single = await createPublished(api, 'Thú bông một ảnh', [one]);
      const full = await seedAssets(ctx, MAX_PRODUCT_MEDIA_ITEMS);

      const grown = await replace(single, full);
      expect(grown.status).toBe(200);
      const stored = await storedMedia(ctx, single.productId);
      expect(stored.map((row) => row.asset_id)).toEqual(full);
      expect(stored.map((row) => row.display_order)).toEqual(
        Array.from({ length: MAX_PRODUCT_MEDIA_ITEMS }, (_, index) => index),
      );

      const back = await replace(single, [full[0]!], (await detailOf(single.productId)).updatedAt);
      expect(back.status).toBe(200);
      expect(await storedMedia(ctx, single.productId)).toEqual([
        { asset_id: full[0], role: 'THUMBNAIL', display_order: 0 },
      ]);
    }, 240_000);
  });

  // ------------------------------------------------------------------- §19

  describe('published refusals are atomic', () => {
    /**
     * Every refusal case is the same proof: the request fails, and the product
     * is byte-for-byte what it was — same images, same status, same commercial
     * columns. Written once so no case can quietly assert less than another.
     */
    async function refuses(
      name: string,
      mediaAssetIds: readonly string[],
      expected: { status: number; code?: string },
      useToken?: (product: ProductPayload) => Promise<string>,
    ): Promise<void> {
      const [a, b] = await seedAssets(ctx, 2);
      const product = await createPublished(api, name, [a!, b!]);

      // The token hook runs *before* the snapshot on purpose: the stale-token
      // case makes a legitimate write first, and "unchanged" must mean unchanged
      // from the state the refused request actually met.
      const token = useToken === undefined ? product.updatedAt : await useToken(product);
      const mediaBefore = await storedMedia(ctx, product.productId);
      const factsBefore = await commercialFacts(ctx, product.productId);

      const res = await replace(product, mediaAssetIds, token);

      expect(res.status).toBe(expected.status);
      if (expected.code !== undefined) {
        expect(res.body).toMatchObject({ code: expected.code });
      }
      expect(await storedMedia(ctx, product.productId)).toEqual(mediaBefore);
      expect(await commercialFacts(ctx, product.productId)).toEqual(factsBefore);
      expect(factsBefore['status']).toBe('PUBLISHED');
    }

    it('refuses an empty selection', async () => {
      await refuses('Thú bông không ảnh', [], {
        status: 409,
        code: 'PRODUCT_MEDIA_NOT_PUBLISHABLE',
      });
    }, 180_000);

    it('refuses a rejected asset', async () => {
      const rejected = await seedAsset(ctx, 'REJECTED');
      await refuses('Thú bông ảnh bị từ chối', [rejected], {
        status: 409,
        code: 'PRODUCT_MEDIA_ASSET_UNAVAILABLE',
      });
    }, 180_000);

    it('refuses a tombstoned asset', async () => {
      const tombstoned = await seedAsset(ctx, 'TOMBSTONED');
      await refuses('Thú bông ảnh đã gỡ', [tombstoned], {
        status: 409,
        code: 'PRODUCT_MEDIA_ASSET_UNAVAILABLE',
      });
    }, 180_000);

    it('refuses an asset missing a required derivative', async () => {
      const incomplete = await seedAsset(ctx, 'MISSING_DERIVATIVE');
      const res = await (async () => {
        const [a, b] = await seedAssets(ctx, 2);
        const product = await createPublished(api, 'Thú bông thiếu bản dẫn xuất', [a!, b!]);
        const before = await storedMedia(ctx, product.productId);
        const attempt = await replace(product, [incomplete]);
        expect(await storedMedia(ctx, product.productId)).toEqual(before);
        expect((await commercialFacts(ctx, product.productId))['status']).toBe('PUBLISHED');
        return attempt;
      })();

      expect(res.status).toBe(409);
      // The refusal names which of the three media requirements failed, so a
      // client learns the cause without a second request.
      expect(res.body).toMatchObject({
        code: 'PRODUCT_MEDIA_NOT_PUBLISHABLE',
        errors: [{ field: 'requirements', code: 'PRODUCT_MEDIA_DERIVATIVES_READY' }],
      });
    }, 180_000);

    it('refuses a duplicated asset', async () => {
      const duplicate = await seedAsset(ctx);
      await refuses('Thú bông ảnh trùng', [duplicate, duplicate], {
        status: 400,
        code: 'PRODUCT_MEDIA_DUPLICATE',
      });
    }, 180_000);

    it(`refuses ${MAX_PRODUCT_MEDIA_ITEMS + 1} images at the published boundary`, async () => {
      const tooMany = await seedAssets(ctx, MAX_PRODUCT_MEDIA_ITEMS + 1);
      // The published `maxItems` is reached first, so the wire answer is the
      // platform's validation envelope naming the field; the domain's
      // `PRODUCT_MEDIA_TOO_MANY` is the backstop behind it.
      await refuses('Thú bông quá nhiều ảnh', tooMany, { status: 400 });
    }, 240_000);

    it('refuses an unknown asset id', async () => {
      await refuses('Thú bông ảnh không tồn tại', [newId()], {
        status: 400,
        code: 'PRODUCT_MEDIA_ASSET_NOT_FOUND',
      });
    }, 180_000);

    it('refuses a stale concurrency token', async () => {
      const replacement = await seedAsset(ctx);
      await refuses(
        'Thú bông token cũ',
        [replacement],
        { status: 409, code: 'PRODUCT_VERSION_CONFLICT' },
        async (product) => {
          // Advance the product with an unrelated write, so the token the
          // request carries is genuinely stale rather than merely wrong.
          const bump = await replace(product, [product.media[0]!.assetId, replacement]);
          expect(bump.status).toBe(200);
          return product.updatedAt;
        },
      );
    }, 180_000);
  });

  // ------------------------------------------------------------------- §20

  describe('draft semantics are unchanged', () => {
    it('accepts an empty selection, one image and twenty', async () => {
      const draft = await createDraft(api, 'Thú bông nháp');
      const twenty = await seedAssets(ctx, MAX_PRODUCT_MEDIA_ITEMS);

      const cleared = await replace(draft, []);
      expect(cleared.status).toBe(200);
      expect(await storedMedia(ctx, draft.productId)).toEqual([]);

      const one = await replace(draft, [twenty[0]!], (await detailOf(draft.productId)).updatedAt);
      expect(one.status).toBe(200);

      const full = await replace(draft, twenty, (await detailOf(draft.productId)).updatedAt);
      expect(full.status).toBe(200);
      expect(await storedMedia(ctx, draft.productId)).toHaveLength(MAX_PRODUCT_MEDIA_ITEMS);
    }, 240_000);

    it('accepts an asset a published product could not carry', async () => {
      // A DRAFT legitimately holds an accepted image whose derivatives the
      // worker has not finished. B2 must not make DRAFT stricter than the
      // `APP2-B02` patch already was.
      const draft = await createDraft(api, 'Thú bông nháp thiếu dẫn xuất');
      const incomplete = await seedAsset(ctx, 'MISSING_DERIVATIVE');

      const res = await replace(draft, [incomplete]);
      expect(res.status).toBe(200);
      expect(await storedMedia(ctx, draft.productId)).toEqual([
        { asset_id: incomplete, role: 'THUMBNAIL', display_order: 0 },
      ]);
    }, 180_000);

    it(`refuses ${MAX_PRODUCT_MEDIA_ITEMS + 1} images and a duplicate on a draft`, async () => {
      const draft = await createDraft(api, 'Thú bông nháp quá nhiều');
      const tooMany = await seedAssets(ctx, MAX_PRODUCT_MEDIA_ITEMS + 1);
      expect((await replace(draft, tooMany)).status).toBe(400);
      expect(await storedMedia(ctx, draft.productId)).toEqual([]);

      const duplicate = tooMany[0]!;
      const repeated = await replace(draft, [duplicate, duplicate]);
      expect(repeated.status).toBe(400);
      expect(repeated.body).toMatchObject({ code: 'PRODUCT_MEDIA_DUPLICATE' });
      expect(await storedMedia(ctx, draft.productId)).toEqual([]);
    }, 240_000);
  });

  // -------------------------------------------------------------- §4 / §14

  describe('state and authorization', () => {
    it('refuses an archived product', async () => {
      const draft = await createDraft(api, 'Thú bông lưu trữ');
      const archived = await api
        .post(`/api/admin/products/${draft.productId}/archive`)
        .send({ expectedUpdatedAt: draft.updatedAt });
      expect(archived.status).toBe(200);
      const token = (archived.body as Envelope<ProductPayload>).data.updatedAt;

      const res = await api
        .put(`/api/admin/products/${draft.productId}/media`)
        .send({ expectedUpdatedAt: token, mediaAssetIds: [await seedAsset(ctx)] });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'PRODUCT_NOT_EDITABLE' });
      expect(await storedMedia(ctx, draft.productId)).toEqual([]);
      expect((await commercialFacts(ctx, draft.productId))['status']).toBe('ARCHIVED');
    }, 180_000);

    it('answers 404 for a product that does not exist', async () => {
      const res = await api
        .put(`/api/admin/products/${newId()}/media`)
        .send({ expectedUpdatedAt: new Date().toISOString(), mediaAssetIds: [] });
      expect(res.status).toBe(404);
    }, 120_000);

    it('refuses anonymously, cross-origin and without JSON, writing nothing', async () => {
      const [a, b] = await seedAssets(ctx, 2);
      const product = await createPublished(api, 'Thú bông bảo vệ', [a!, b!]);
      const before = await storedMedia(ctx, product.productId);
      const path = `/api/admin/products/${product.productId}/media`;
      const body = { expectedUpdatedAt: product.updatedAt, mediaAssetIds: [b!, a!] };

      expect((await ctx.http.put(path).set('Origin', ADMIN_ORIGIN).send(body)).status).toBe(401);
      expect(
        (
          await ctx.http
            .put(path)
            .set('Cookie', 'adm_session=x')
            .set('Origin', ADMIN_ORIGIN)
            .send(body)
        ).status,
      ).toBe(401);
      expect(
        (await api.put(path).set('Origin', 'http://evil.example.test').send(body)).status,
      ).toBe(403);
      expect((await api.put(path).type('text/plain').send(JSON.stringify(body))).status).toBe(415);

      expect(await storedMedia(ctx, product.productId)).toEqual(before);
    }, 180_000);

    it('rejects a body that names a role, a position or a primary flag', async () => {
      const asset = await seedAsset(ctx);
      const product = await createPublished(api, 'Thú bông thân chặt', [asset]);
      const res = await api.put(`/api/admin/products/${product.productId}/media`).send({
        expectedUpdatedAt: product.updatedAt,
        mediaAssetIds: [asset],
        isPrimary: true,
      });
      expect(res.status).toBe(400);
    }, 180_000);
  });

  // ------------------------------------------------------------------- §13

  describe('public read consistency', () => {
    it('carries a new primary and a new order to the public surfaces', async () => {
      const [a, b, c] = await seedAssets(ctx, 3);
      const product = await createPublished(api, 'Thú bông công khai', [a!, b!, c!]);

      const before = await ctx.http.get(`/api/public/products/${product.slug}`);
      expect(before.status).toBe(200);
      expect(
        (before.body as Envelope<{ media: { productMediaId: string }[] }>).data.media,
      ).toHaveLength(3);

      const res = await replace(product, [c!, b!, a!]);
      expect(res.status).toBe(200);

      const ids = await storedMediaIds(ctx, product.productId);

      // Product Detail: `media[0]` is the effective primary, and the Storefront
      // derives both `og:image` and JSON-LD `image[0]` from exactly this item
      // (`APP12-M01.B1` §D) — neither has a read of its own to disagree with.
      const detail = await ctx.http.get(`/api/public/products/${product.slug}`);
      expect(detail.status).toBe(200);
      const publicMedia = (detail.body as Envelope<{ media: { url: string }[] }>).data.media;
      expect(publicMedia).toHaveLength(3);
      expect(publicMedia[0]!.url).toContain(ids.get(c!));
      expect(publicMedia.map((item) => item.url.includes(ids.get(b!)!))).toEqual([
        false,
        true,
        false,
      ]);

      // Discover: the card image is that same first item's small rendition.
      const list = await ctx.http.get('/api/public/products?limit=100');
      expect(list.status).toBe(200);
      const card = (
        list.body as Envelope<{ items: { slug: string; thumbnail?: { url: string } }[] }>
      ).data.items.find((item) => item.slug === product.slug);
      expect(card?.thumbnail?.url).toContain(ids.get(c!));

      // Stored truth behind all of it, and the product never left PUBLISHED.
      expect(await storedMedia(ctx, product.productId)).toEqual([
        { asset_id: c, role: 'THUMBNAIL', display_order: 0 },
        { asset_id: b, role: 'GALLERY', display_order: 1 },
        { asset_id: a, role: 'GALLERY', display_order: 2 },
      ]);
      expect((await commercialFacts(ctx, product.productId))['status']).toBe('PUBLISHED');
    }, 240_000);
  });
});
