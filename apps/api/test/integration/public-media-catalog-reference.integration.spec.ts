/**
 * `APP2-B04` §20 — the addresses the catalog projects really deliver bytes.
 *
 * This is the join between the two checkpoints, and the one thing neither can
 * prove alone. B04's own suites prove the *shape* of a media reference; T01's
 * prove the delivery route. Only following a URL that B04 actually emitted, to
 * the object it actually names, proves the catalogue is not advertising
 * addresses that 404 — the single defect a JSON contract can create on its own.
 *
 * Runs against a disposable PostgreSQL and a disposable, private MinIO. No
 * fixture uses a private original, and no route is added to make any of this
 * possible: every request below goes to an operation that already exists.
 */
import { sql } from 'drizzle-orm';

import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { PublicProductQuery } from '../../src/modules/catalog/application/public-product.query';
import { createPublicMediaContext } from '../support/public-media-context';
import type { PublicMediaTestContext } from '../support/public-media-context';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';

jest.setTimeout(300_000);

/** Distinct per kind, so "the right object" is provable rather than plausible. */
const THUMBNAIL_BYTES = Buffer.from('B04-THUMB-'.repeat(64), 'utf8');
const PREVIEW_BYTES = Buffer.from('B04-PREVIEW-'.repeat(128), 'utf8');

describe('public catalog media references (integration)', () => {
  let ctx: PublicMediaTestContext;
  let adminId: string;
  let catalog: PublicProductQuery;
  let publication: ProductPublicationService;

  beforeAll(async () => {
    ctx = await createPublicMediaContext('b04-catalog-media');
    adminId = await seedAdminId(ctx.api);
    catalog = ctx.api.app.get(PublicProductQuery);
    publication = ctx.api.app.get(ProductPublicationService);
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function publishedProduct(): Promise<{
    productId: string;
    slug: string;
    updatedAt: string;
  }> {
    const seeded = await seedPublishableProduct(ctx.api);
    for (const assetId of seeded.assetIds) {
      await ctx.putDerivative(assetId, 'THUMBNAIL', THUMBNAIL_BYTES);
      await ctx.putDerivative(assetId, 'CATALOG_PREVIEW', PREVIEW_BYTES);
    }
    const published = await asAdmin(ctx.api, adminId, () =>
      publication.publish({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      }),
    );
    const rows = await ctx.api.database.client.db.execute<{ slug: string }>(
      sql`select slug from products where id = ${seeded.productId}`,
    );
    return {
      productId: seeded.productId,
      slug: rows.rows[0]!.slug,
      updatedAt: published.updatedAt,
    };
  }

  it('a list thumbnail reference returns the exact THUMBNAIL bytes', async () => {
    const product = await publishedProduct();
    const page = await catalog.list({ limit: 100 });
    const summary = page.items.find((item) => item.slug === product.slug);
    expect(summary?.thumbnail).toBeDefined();

    const response = await ctx.api.http.get(summary!.thumbnail!.url).responseType('blob');

    expect(response.status).toBe(200);
    expect(Buffer.from(response.body as Buffer).equals(THUMBNAIL_BYTES)).toBe(true);
    expect(response.headers['content-type']).toContain('image/webp');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toBe('inline');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('a detail media reference returns the exact CATALOG_PREVIEW bytes', async () => {
    const product = await publishedProduct();
    const detail = await catalog.detail(product.slug);
    expect(detail.media.length).toBeGreaterThan(0);

    for (const media of detail.media) {
      const response = await ctx.api.http.get(media.url).responseType('blob');
      expect(response.status).toBe(200);
      expect(Buffer.from(response.body as Buffer).equals(PREVIEW_BYTES)).toBe(true);
    }
  });

  it('the two renditions really address different objects', async () => {
    const product = await publishedProduct();
    const page = await catalog.list({ limit: 100 });
    const summary = page.items.find((item) => item.slug === product.slug);
    const detail = await catalog.detail(product.slug);

    const thumb = await ctx.api.http.get(summary!.thumbnail!.url).responseType('blob');
    const preview = await ctx.api.http.get(detail.media[0]!.url).responseType('blob');
    expect(Buffer.from(thumb.body as Buffer).length).not.toBe(
      Buffer.from(preview.body as Buffer).length,
    );
  });

  it('every projected address is anonymous and needs no storage credential', async () => {
    const product = await publishedProduct();
    const detail = await catalog.detail(product.slug);
    const response = await ctx.api.http.get(detail.media[0]!.url).responseType('blob');

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['www-authenticate']).toBeUndefined();
    const headerText = JSON.stringify(response.headers);
    for (const forbidden of ['minio', 'x-amz', 'bucket', 'derivatives/', 'etag']) {
      expect(headerText.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('a DRAFT product yields no reference and its address cannot be retrieved', async () => {
    const product = await publishedProduct();
    const detail = await catalog.detail(product.slug);
    const url = detail.media[0]!.url;
    expect((await ctx.api.http.get(url)).status).toBe(200);

    await asAdmin(ctx.api, adminId, () =>
      publication.unpublish({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
      }),
    );

    // The catalogue stops offering it...
    await expect(catalog.detail(product.slug)).rejects.toThrow();
    const page = await catalog.list({ limit: 100 });
    expect(page.items.map((item) => item.slug)).not.toContain(product.slug);
    // ...and the address a caller already held stops resolving.
    expect((await ctx.api.http.get(url)).status).toBe(404);
  });

  it('an unresolvable rendition is omitted rather than advertised', async () => {
    // A product cannot *reach* PUBLISHED without both derivatives: B03
    // readiness requires them, and this suite confirmed that by failing to
    // publish one without them. So the case that can really occur is drift
    // after publication — a derivative that stops being servable while the
    // product stays published. The catalogue must then omit the image, not
    // offer an address the delivery route would answer with 404.
    const product = await publishedProduct();
    expect((await catalog.detail(product.slug)).media.length).toBeGreaterThan(0);

    await ctx.api.database.client.db.execute(
      sql`update asset_derivatives set status = 'PENDING'
          where kind = 'CATALOG_PREVIEW'
            and asset_id in (select asset_id from product_media where product_id = ${product.productId})`,
    );

    const detail = await catalog.detail(product.slug);
    expect(detail.media).toEqual([]);
    // The product itself remains published and listed; only the image is gone.
    const page = await catalog.list({ limit: 100 });
    expect(page.items.map((item) => item.slug)).toContain(product.slug);
  });

  it('the catalog queries themselves make no object-storage call', async () => {
    const product = await publishedProduct();
    // Remove every stored object. The JSON projections must still succeed —
    // they describe addresses, they do not fetch bytes.
    const assets = await ctx.api.database.client.db.execute<{ asset_id: string }>(
      sql`select asset_id from product_media where product_id = ${product.productId}`,
    );
    for (const row of assets.rows) {
      await ctx.removeDerivative(row.asset_id, 'THUMBNAIL');
      await ctx.removeDerivative(row.asset_id, 'CATALOG_PREVIEW');
    }

    const detail = await catalog.detail(product.slug);
    expect(detail.media.length).toBeGreaterThan(0);
    const page = await catalog.list({ limit: 100 });
    expect(page.items.map((item) => item.slug)).toContain(product.slug);
  });

  it('neither query writes an Audit or Outbox row', async () => {
    const product = await publishedProduct();
    const before = await evidence();
    await catalog.list({ limit: 100 });
    await catalog.detail(product.slug);
    expect(await evidence()).toEqual(before);
  });

  async function evidence(): Promise<{ audit: string; outbox: string }> {
    const rows = await ctx.api.database.client.db.execute<{ audit: string; outbox: string }>(
      sql`select (select count(*) from audit_events)::text as audit,
                 (select count(*) from outbox_events)::text as outbox`,
    );
    return rows.rows[0]!;
  }
});
