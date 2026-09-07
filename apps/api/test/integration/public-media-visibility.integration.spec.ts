/**
 * The public catalog-media visibility predicate, against real PostgreSQL and
 * real MinIO (`APP2-T01` §17/§21).
 *
 * Every case here asserts the *same* response. That repetition is the contract:
 * a caller must not be able to distinguish an unpublished product from a
 * nonexistent one, a withdrawn image from a foreign id, or a failed derivative
 * from a wrong lane. If any one of these ever answered differently, the route
 * would have become an oracle for facts that are not public yet.
 *
 * Several states are reached by degrading a row *after* publication — a product
 * cannot be published with a pending or watermarked derivative, so that is the
 * only way those states exist on a published product. It is also exactly the
 * real scenario the per-request re-check defends against: the world changing
 * after publication said yes.
 */
import { sql } from 'drizzle-orm';

import {
  createPublicMediaContext,
  type PublicMediaTestContext,
} from '../support/public-media-context';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';
import { ProductDraftService } from '../../src/modules/catalog/application/product-draft.service';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';

const BYTES = Buffer.from('WEBP-BYTES-'.repeat(32), 'utf8');
const UNKNOWN_UUID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099';

interface PublishedFixture {
  readonly slug: string;
  readonly productId: string;
  readonly thumbnailMediaId: string;
  readonly galleryMediaId: string;
  readonly assetIds: readonly string[];
  readonly updatedAt: string;
}

describe('public catalog-media visibility (integration)', () => {
  let ctx: PublicMediaTestContext;
  let adminId: string;
  let publication: ProductPublicationService;
  let drafts: ProductDraftService;

  beforeAll(async () => {
    ctx = await createPublicMediaContext('t01-media-visibility');
    adminId = await seedAdminId(ctx.api);
    publication = ctx.api.app.get(ProductPublicationService);
    drafts = ctx.api.app.get(ProductDraftService);
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function seedWithObjects(categorySlug?: string) {
    const seeded = await seedPublishableProduct(
      ctx.api,
      categorySlug === undefined ? {} : { categorySlug },
    );
    for (const assetId of seeded.assetIds) {
      await ctx.putDerivative(assetId, 'THUMBNAIL', BYTES);
      await ctx.putDerivative(assetId, 'CATALOG_PREVIEW', BYTES);
    }
    return seeded;
  }

  async function mediaIds(productId: string): Promise<{ thumbnail: string; gallery: string }> {
    const rows = (
      await ctx.api.database.client.db.execute(sql`
        select id, role from product_media where product_id = ${productId} order by display_order
      `)
    ).rows as { id: string; role: string }[];
    const thumbnail = rows.find((row) => row.role === 'THUMBNAIL')?.id;
    const gallery = rows.find((row) => row.role === 'GALLERY')?.id;
    if (thumbnail === undefined || gallery === undefined) {
      throw new Error('The fixture did not produce both associations.');
    }
    return { thumbnail, gallery };
  }

  async function publish(categorySlug?: string): Promise<PublishedFixture> {
    const seeded = await seedWithObjects(categorySlug);
    const published = await asAdmin(ctx.api, adminId, () =>
      publication.publish({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      }),
    );
    const ids = await mediaIds(seeded.productId);
    return {
      slug: published.slug,
      productId: seeded.productId,
      thumbnailMediaId: ids.thumbnail,
      galleryMediaId: ids.gallery,
      assetIds: seeded.assetIds,
      updatedAt: published.updatedAt,
    };
  }

  function path(slug: string, mediaId: string, rendition = 'thumbnail'): string {
    return `/api/public/products/${slug}/media/${mediaId}/${rendition}`;
  }

  /**
   * The one response every miss must produce.
   *
   * The code is asserted by equality rather than scanned for, because the code
   * *is* `PUBLIC_PRODUCT_MEDIA_NOT_FOUND` — a substring scan over the whole body
   * would match the very constant that proves non-disclosure. Only the free
   * text and the metadata can leak, so only those are swept.
   */
  async function expectSafeNotFound(target: string): Promise<void> {
    const response = await ctx.api.http.get(target).expect(404);
    const body = response.body as { success: boolean; code: string; message: string };

    expect(body.success).toBe(false);
    expect(body.code).toBe('PUBLIC_PRODUCT_MEDIA_NOT_FOUND');

    const disclosable = JSON.stringify({ ...(response.body as object), code: undefined });
    for (const forbidden of [
      'DRAFT',
      'ARCHIVED',
      'PENDING',
      'PROCESSING',
      'FAILED',
      'REJECTED',
      'watermark',
      'derivatives/',
      'bucket',
      'category',
      'select ',
      'GALLERY',
      'CATALOG_MEDIA',
      'storage_key',
    ]) {
      expect(disclosable.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  }

  describe('product lifecycle', () => {
    it('does not serve a DRAFT product', async () => {
      const seeded = await seedWithObjects();
      const ids = await mediaIds(seeded.productId);
      const [row] = (
        await ctx.api.database.client.db.execute(
          sql`select slug from products where id = ${seeded.productId}`,
        )
      ).rows as { slug: string }[];

      await expectSafeNotFound(path(row?.slug ?? '', ids.thumbnail));
    });

    it('does not serve an ARCHIVED product', async () => {
      const seeded = await seedWithObjects();
      const ids = await mediaIds(seeded.productId);
      const archived = await asAdmin(ctx.api, adminId, () =>
        drafts.archive({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(seeded.updatedAt),
        }),
      );

      await expectSafeNotFound(path(archived.slug, ids.thumbnail));
    });

    it('does not serve an unknown slug', async () => {
      const product = await publish();

      await expectSafeNotFound(path('khong-ton-tai-san-pham', product.thumbnailMediaId));
    });
  });

  describe('category', () => {
    it('does not serve a published product in a withdrawn category', async () => {
      const product = await publish('khan');
      const target = path(product.slug, product.thumbnailMediaId);
      await ctx.api.http.get(target).responseType('blob').expect(200);

      await ctx.api.database.client.db.execute(
        sql`update categories set status = 'ARCHIVED', archived_at = now() where slug = 'khan'`,
      );
      try {
        await expectSafeNotFound(target);
      } finally {
        await ctx.api.database.client.db.execute(
          sql`update categories set status = 'PUBLISHED', archived_at = null where slug = 'khan'`,
        );
      }
    });
  });

  describe('association identity', () => {
    it('does not serve an unknown association id', async () => {
      const product = await publish();

      await expectSafeNotFound(path(product.slug, UNKNOWN_UUID));
    });

    it('does not serve an association belonging to another product', async () => {
      const first = await publish();
      const second = await publish();

      // A real, published, deliverable association — just not this product's.
      await ctx.api.http
        .get(path(second.slug, second.thumbnailMediaId))
        .responseType('blob')
        .expect(200);
      await expectSafeNotFound(path(first.slug, second.thumbnailMediaId));
    });

    it('does not serve a detached association', async () => {
      const product = await publish();
      await ctx.api.database.client.db.execute(
        sql`delete from product_media where id = ${product.galleryMediaId}`,
      );

      await expectSafeNotFound(path(product.slug, product.galleryMediaId, 'catalog-preview'));
    });

    it('serves a gallery association at both renditions (APP12-M01-B1)', async () => {
      const product = await publish();

      // Until `APP12-M01-B1` the small rendition was refused here, on the
      // reasoning that it existed only to serve the product card. That was an
      // **editorial** narrowing, not a visibility boundary — as this test itself
      // shows, the very same image is served at `catalog-preview` on the line
      // above, so its bytes were already public and refusing them at 480 px
      // protected nothing.
      //
      // Two things retired the reasoning: the card now picks its image by
      // `PUBLIC_EFFECTIVE_PRIMARY_ORDER` rather than by that role, and the
      // Product Detail thumbnail strip needs the small rendition of exactly
      // these gallery associations — with the restriction in place, every
      // address the detail contract published for them answered 404.
      //
      // Every real visibility guarantee is unchanged and is asserted by this
      // suite's neighbouring cases: another product's association, a detached
      // association, an unpublished product, a withdrawn category, and each
      // asset-lane and derivative-state rule all still refuse.
      for (const rendition of ['catalog-preview', 'thumbnail'] as const) {
        await ctx.api.http
          .get(path(product.slug, product.galleryMediaId, rendition))
          .responseType('blob')
          .expect(200);
      }
    });
  });

  describe('asset lane', () => {
    it.each([
      ['a rejected asset', sql`status = 'REJECTED'`],
      ['an asset outside catalog media', sql`kind = 'GALLERY_MEDIA'`],
      ['a publicly reclassified asset', sql`classification = 'PUBLIC'`],
      ['a tombstoned asset', sql`deleted_at = now()`],
    ])('does not serve %s', async (_label, mutation) => {
      const product = await publish();
      await ctx.api.database.client.db.execute(
        sql`update assets set ${mutation} where id = ${product.assetIds[0] ?? ''}`,
      );

      await expectSafeNotFound(path(product.slug, product.thumbnailMediaId));
    });
  });

  describe('derivative readiness', () => {
    it.each([
      ['a pending derivative', sql`status = 'PENDING', storage_key = null`],
      ['a processing derivative', sql`status = 'PROCESSING', storage_key = null`],
      ['a failed derivative', sql`status = 'FAILED', storage_key = null`],
      ['a watermarked derivative', sql`is_watermarked = true`],
    ])('does not serve %s', async (_label, mutation) => {
      const product = await publish();
      await ctx.api.database.client.db.execute(sql`
        update asset_derivatives set ${mutation}
        where asset_id = ${product.assetIds[0] ?? ''} and kind = 'THUMBNAIL'
      `);

      await expectSafeNotFound(path(product.slug, product.thumbnailMediaId));
    });

    it('does not serve a derivative that was never generated', async () => {
      const product = await publish();
      await ctx.api.database.client.db.execute(sql`
        delete from asset_derivatives
        where asset_id = ${product.assetIds[0] ?? ''} and kind = 'CATALOG_PREVIEW'
      `);

      await expectSafeNotFound(path(product.slug, product.thumbnailMediaId, 'catalog-preview'));
    });

    it('never falls back to another rendition when the requested one is gone', async () => {
      const product = await publish();
      await ctx.api.database.client.db.execute(sql`
        delete from asset_derivatives
        where asset_id = ${product.assetIds[0] ?? ''} and kind = 'THUMBNAIL'
      `);

      // The CATALOG_PREVIEW is still perfectly deliverable; the card must not
      // silently become the large image.
      await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, 'catalog-preview'))
        .responseType('blob')
        .expect(200);
      await expectSafeNotFound(path(product.slug, product.thumbnailMediaId, 'thumbnail'));
    });
  });

  describe('address syntax', () => {
    it.each([
      ['an unknown rendition', 'original'],
      ['a derivative kind', 'PREVIEW_WATERMARKED'],
      ['an uppercase rendition', 'THUMBNAIL'],
    ])('rejects %s with a safe 400', async (_label, rendition) => {
      const product = await publish();

      const response = await ctx.api.http
        .get(path(product.slug, product.thumbnailMediaId, rendition))
        .expect(400);

      expect(response.body).toMatchObject({ success: false });
      expect(JSON.stringify(response.body)).not.toContain('derivatives/');
    });

    it('rejects a malformed association id with a safe 400', async () => {
      const product = await publish();

      await ctx.api.http.get(path(product.slug, 'not-a-uuid')).expect(400);
    });

    it('rejects a malformed slug with a safe 400', async () => {
      const product = await publish();

      await ctx.api.http.get(path('KHONG_HOP_LE', product.thumbnailMediaId)).expect(400);
    });

    it('cannot be steered at an arbitrary object through the path', async () => {
      // Percent-encoded traversal in both identity segments: neither reaches a
      // storage key, because the key is read from the row, never composed.
      await ctx.api.http
        .get('/api/public/products/%2E%2E%2F%2E%2E%2Fetc/media/x/thumbnail')
        .expect((response) => {
          expect([400, 404]).toContain(response.status);
        });
    });
  });
});
