/**
 * `APP11-B04` over HTTP — the public indexable-URL inventory.
 *
 * The whole stack runs against a disposable PostgreSQL and a disposable MinIO:
 * the response envelope, the exception filter, the real catalog publication
 * predicate, the real gallery publication and media-eligibility predicates.
 * Asserted here and nowhere else is what no schema check can see — that
 * indexability and visibility are genuinely two different questions, that every
 * slug the inventory advertises resolves through the very read that serves it,
 * that withdrawing the last deliverable image removes a gallery entry from the
 * index without touching its stored lifecycle, and that the anonymous surface
 * never touches a cookie.
 */
import { sql } from 'drizzle-orm';

import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import {
  createPublicMediaContext,
  type PublicMediaTestContext,
} from '../support/public-media-context';
import { asAdmin, seedPublishableProduct } from '../support/product-publication-fixtures';
import {
  GALLERY_FIXTURE_EMAIL,
  GALLERY_FIXTURE_PASSWORD,
  loginAsOperator,
} from '../support/gallery-lifecycle-fixture';
import {
  DETAIL_KIND,
  galleryAuthoring,
  publicGalleryDetailUrl,
  publicGalleryReader,
  seedDeliverableAsset,
  tombstoneAsset,
} from '../support/gallery-public-fixture';

const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const SITEMAP_PATH = '/api/public/sitemap-entries';

interface SitemapEntry {
  readonly kind: string;
  readonly slug: string;
  readonly updatedAt: string;
}

describe('Public SEO sitemap inventory (integration)', () => {
  let ctx: PublicMediaTestContext;
  let previousOrigins: string | undefined;
  let authoring: ReturnType<typeof galleryAuthoring>;
  let anon: ReturnType<typeof publicGalleryReader>;
  let adminId: string;

  beforeAll(async () => {
    previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
    process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;
    ctx = await createPublicMediaContext('app11b04-public-sitemap');
    await ctx.api.app.get(BootstrapStaffUseCase).bootstrap({
      email: GALLERY_FIXTURE_EMAIL,
      password: GALLERY_FIXTURE_PASSWORD,
      displayName: 'Quản trị viên',
      rotate: false,
    });
    ctx.api.app.get(LoginRateLimiter).reset();
    const cookie = await loginAsOperator(ctx.api.http, ADMIN_ORIGIN);
    authoring = galleryAuthoring(ctx.api, cookie, ADMIN_ORIGIN);
    anon = publicGalleryReader(ctx.api);
    adminId = await anon.bootstrappedAdminId();
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
    if (previousOrigins === undefined) {
      delete process.env['STAFF_ALLOWED_ORIGINS'];
    } else {
      process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    }
  }, 300_000);

  /** Anonymous: no cookie, no Origin, no header of any kind. */
  async function inventory(): Promise<readonly SitemapEntry[]> {
    const res = await ctx.api.http.get(SITEMAP_PATH);
    expect(res.status).toBe(200);
    return (res.body as { data: { items: SitemapEntry[] } }).data.items;
  }

  const slugsOf = (items: readonly SitemapEntry[], kind: string) =>
    items.filter((item) => item.kind === kind).map((item) => item.slug);

  /** Removes every gallery entry and product so an assertion sees only its own rows. */
  async function clearAll(): Promise<void> {
    await anon.clearGallery();
    await ctx.api.database.client.db.execute(sql`delete from product_media`);
    await ctx.api.database.client.db.execute(sql`delete from products`);
  }

  /** A PUBLISHED product, through the real publication service. */
  async function publishedProduct(): Promise<{ productId: string; slug: string }> {
    const product = await seedPublishableProduct(ctx.api);
    await asAdmin(ctx.api, adminId, () =>
      ctx.api.app.get(ProductPublicationService).publish({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
      }),
    );
    const found = await ctx.api.database.client.db.execute(
      sql`select slug from products where id = ${product.productId}`,
    );
    return { productId: product.productId, slug: (found.rows[0] as { slug: string }).slug };
  }

  const setProductIndexable = (productId: string, value: boolean) =>
    ctx.api.database.client.db.execute(
      sql`update products set is_indexable = ${value} where id = ${productId}`,
    );

  describe('Product inventory', () => {
    it('lists a published, indexable product and nothing that is not both', async () => {
      await clearAll();
      const listed = await publishedProduct();
      const noindex = await publishedProduct();
      await setProductIndexable(noindex.productId, false);
      // A DRAFT product: publishable, never published.
      const draft = await seedPublishableProduct(ctx.api);
      const draftSlug = (
        (
          await ctx.api.database.client.db.execute(
            sql`select slug from products where id = ${draft.productId}`,
          )
        ).rows[0] as { slug: string }
      ).slug;

      const products = slugsOf(await inventory(), 'PRODUCT');

      expect(products).toEqual([listed.slug]);
      expect(products).not.toContain(noindex.slug);
      expect(products).not.toContain(draftSlug);
    });

    it('drops a product the operator unpublishes, on the very next read', async () => {
      await clearAll();
      const product = await publishedProduct();
      expect(slugsOf(await inventory(), 'PRODUCT')).toEqual([product.slug]);

      const current = (
        (
          await ctx.api.database.client.db.execute(
            sql`select updated_at from products where id = ${product.productId}`,
          )
        ).rows[0] as { updated_at: Date }
      ).updated_at;
      await asAdmin(ctx.api, adminId, () =>
        ctx.api.app.get(ProductPublicationService).unpublish({
          productId: product.productId,
          expectedUpdatedAt: new Date(current),
        }),
      );

      expect(slugsOf(await inventory(), 'PRODUCT')).toEqual([]);
    });

    it('excludes a published product whose category is archived', async () => {
      await clearAll();
      const product = await publishedProduct();
      expect(slugsOf(await inventory(), 'PRODUCT')).toEqual([product.slug]);

      // The third term of the catalog publication predicate, which the sitemap
      // reuses rather than restates.
      await ctx.api.database.client.db.execute(sql`
        update categories set archived_at = now()
        where id = (select category_id from products where id = ${product.productId})
      `);
      expect(slugsOf(await inventory(), 'PRODUCT')).toEqual([]);

      await ctx.api.database.client.db.execute(sql`update categories set archived_at = null`);
    });

    it('reports the product entity updated_at, not the request time', async () => {
      await clearAll();
      const product = await publishedProduct();

      const [item] = await inventory();
      const stored = (
        (
          await ctx.api.database.client.db.execute(
            sql`select updated_at from products where id = ${product.productId}`,
          )
        ).rows[0] as { updated_at: Date }
      ).updated_at;

      expect(item?.updatedAt).toBe(new Date(stored).toISOString());
      // Twice in a row, unchanged: a fabricated stamp would move.
      expect((await inventory())[0]?.updatedAt).toBe(item?.updatedAt);
    });
  });

  describe('Gallery inventory', () => {
    const seedAsset = (options?: Parameters<typeof seedDeliverableAsset>[2]) =>
      seedDeliverableAsset(ctx.api, ctx.storage, options);

    it('lists a published, indexable, renderable entry and nothing that is not all three', async () => {
      await clearAll();
      const [a, b, c, d] = await Promise.all([seedAsset(), seedAsset(), seedAsset(), seedAsset()]);
      const listed = await authoring.published([a]);
      const noindex = await authoring.published([b], { isIndexable: false });
      const draft = await authoring.attach(await authoring.createEntry(), [c]);
      // Published and indexable, but its only image carries no detail rendition.
      const noMedia = await authoring.published([await seedAsset({ derivatives: ['THUMBNAIL'] })]);
      // A published entry that is then archived through the operator surface.
      const archived = await authoring.published([d]);
      await ctx.api.database.client.db.execute(sql`
        update gallery_entries set status = 'ARCHIVED', archived_at = now()
        where id = ${archived.galleryEntryId}
      `);

      const gallery = slugsOf(await inventory(), 'GALLERY');

      expect(gallery).toEqual([listed.slug]);
      for (const absent of [noindex.slug, draft.slug, noMedia.slug, archived.slug]) {
        expect(gallery).not.toContain(absent);
      }
    });

    it('drops an entry when its last deliverable image is withdrawn, without unpublishing it', async () => {
      await clearAll();
      const assetId = await seedAsset();
      const entry = await authoring.published([assetId]);
      expect(slugsOf(await inventory(), 'GALLERY')).toEqual([entry.slug]);

      await tombstoneAsset(ctx.api, assetId);

      expect(slugsOf(await inventory(), 'GALLERY')).toEqual([]);
      // The stored lifecycle is untouched: a GET withdrew nothing.
      const row = await ctx.api.database.client.db.execute(
        sql`select status from gallery_entries where id = ${entry.galleryEntryId}`,
      );
      expect((row.rows[0] as { status: string }).status).toBe('PUBLISHED');
    });

    it('re-includes the entry once a deliverable image is restored', async () => {
      await clearAll();
      const assetId = await seedAsset();
      const entry = await authoring.published([assetId]);
      await tombstoneAsset(ctx.api, assetId);
      expect(slugsOf(await inventory(), 'GALLERY')).toEqual([]);

      await ctx.api.database.client.db.execute(
        sql`update assets set status = 'ACCEPTED', deleted_at = null where id = ${assetId}`,
      );

      expect(slugsOf(await inventory(), 'GALLERY')).toEqual([entry.slug]);
    });

    it('reports the gallery entity updated_at, which publication advances', async () => {
      await clearAll();
      const entry = await authoring.published([await seedAsset()]);

      const [item] = await inventory();
      expect(item?.updatedAt).toBe(new Date(entry.updatedAt).toISOString());
    });
  });

  describe('cross-contract alignment', () => {
    const seedAsset = () => seedDeliverableAsset(ctx.api, ctx.storage);

    it('advertises only slugs the public detail reads actually resolve', async () => {
      await clearAll();
      const product = await publishedProduct();
      const entry = await authoring.published([await seedAsset()]);

      const items = await inventory();
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        const path =
          item.kind === 'PRODUCT'
            ? `/api/public/products/${item.slug}`
            : publicGalleryDetailUrl(item.slug);
        const res = await ctx.api.http.get(path);
        expect(res.status).toBe(200);
      }
      expect(slugsOf(items, 'PRODUCT')).toContain(product.slug);
      expect(slugsOf(items, 'GALLERY')).toContain(entry.slug);
    });

    it('keeps a noindex entity publicly readable while absent from the inventory', async () => {
      await clearAll();
      const product = await publishedProduct();
      await setProductIndexable(product.productId, false);
      const entry = await authoring.published([await seedAsset()], { isIndexable: false });

      const items = await inventory();
      expect(items).toEqual([]);

      // Both still resolve: indexability is an SEO directive, not access control.
      expect((await ctx.api.http.get(`/api/public/products/${product.slug}`)).status).toBe(200);
      expect((await ctx.api.http.get(publicGalleryDetailUrl(entry.slug))).status).toBe(200);
    });

    it('never advertises a gallery slug whose detail would 404', async () => {
      await clearAll();
      const assetId = await seedAsset();
      const entry = await authoring.published([assetId]);
      await tombstoneAsset(ctx.api, assetId);

      expect(slugsOf(await inventory(), 'GALLERY')).toEqual([]);
      expect((await ctx.api.http.get(publicGalleryDetailUrl(entry.slug))).status).toBe(404);
    });
  });

  describe('contract & scope', () => {
    const seedAsset = () => seedDeliverableAsset(ctx.api, ctx.storage);

    it('serves an anonymous GET, unstored, with only the three sitemap fields', async () => {
      await clearAll();
      await publishedProduct();
      await authoring.published([await seedAsset()]);

      const res = await ctx.api.http.get(SITEMAP_PATH);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['set-cookie']).toBeUndefined();
      const items = (res.body as { data: { items: SitemapEntry[] } }).data.items;
      expect(items.length).toBe(2);
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(['kind', 'slug', 'updatedAt']);
        expect(['PRODUCT', 'GALLERY']).toContain(item.kind);
      }
      // No storage, asset or identity fact anywhere in the payload.
      const serialized = JSON.stringify(res.body);
      for (const forbidden of [
        'storageKey',
        'storage_key',
        'bucket',
        'assetId',
        'productId',
        'galleryEntryId',
        'linkedProductId',
        'classification',
        'derivative',
        'http://',
        'https://',
        '/san-pham/',
        '/bo-suu-tap/',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it('is deterministic: kind then slug, identical across calls', async () => {
      await clearAll();
      await Promise.all([publishedProduct(), publishedProduct(), publishedProduct()]);
      await authoring.published([await seedAsset()]);
      await authoring.published([await seedAsset()]);

      const first = await inventory();
      const second = await inventory();

      expect(second).toEqual(first);
      // Products first, then gallery entries — the declared kind order.
      expect(first.map((item) => item.kind)).toEqual([
        'PRODUCT',
        'PRODUCT',
        'PRODUCT',
        'GALLERY',
        'GALLERY',
      ]);
      expect(slugsOf(first, 'PRODUCT')).toEqual([...slugsOf(first, 'PRODUCT')].sort());
      expect(slugsOf(first, 'GALLERY')).toEqual([...slugsOf(first, 'GALLERY')].sort());
    });

    it('ignores any query parameter a caller invents, rather than paging', async () => {
      await clearAll();
      await publishedProduct();

      const plain = await inventory();
      const withQuery = await ctx.api.http.get(`${SITEMAP_PATH}?limit=1&cursor=abc&page=2`);

      expect(withQuery.status).toBe(200);
      expect((withQuery.body as { data: { items: SitemapEntry[] } }).data.items).toEqual(plain);
    });

    it('emits no content-page row', async () => {
      await clearAll();
      await ctx.api.database.client.db.execute(sql`delete from content_pages`);
      await ctx.api.database.client.db.execute(sql`
        insert into content_pages (id, page_type, slug, title, body, status, is_indexable)
        values (gen_random_uuid(), 'POLICY', 'chinh-sach-bao-mat', 'Chính sách bảo mật',
                'Nội dung.', 'PUBLISHED', true)
      `);

      const items = await inventory();

      expect(items.map((item) => item.slug)).not.toContain('chinh-sach-bao-mat');
      expect(items).toEqual([]);
      await ctx.api.database.client.db.execute(sql`delete from content_pages`);
    });
  });

  it('excludes an entry whose only deliverable rendition is the feed thumbnail', async () => {
    // Alignment is with the *detail* read, which is what a sitemap URL points
    // at: the feed's own rendition is not the question B04 asks.
    await clearAll();
    const entry = await authoring.published([
      await seedDeliverableAsset(ctx.api, ctx.storage, { derivatives: [DETAIL_KIND] }),
    ]);

    expect(slugsOf(await inventory(), 'GALLERY')).toEqual([entry.slug]);
    expect((await ctx.api.http.get(publicGalleryDetailUrl(entry.slug))).status).toBe(200);
  });
});
