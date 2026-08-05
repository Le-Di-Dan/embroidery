/**
 * `APP3-B01` public placement manifest against a real database.
 *
 * `studioEligible` is the whole point of this suite, and it is a *derived*
 * claim: it says a customer can actually open the Studio on this product. Every
 * case below is a way for that to be false while the placement still looks
 * complete from one angle — a background whose derivative never finished, a
 * derivative of the wrong kind, a watermarked one, an area on a side whose
 * background is unusable, a retired row that would have satisfied it.
 *
 * The other half is visibility: an unpublished product's placement must not be
 * reachable at all, and for the same reason the catalogue gives — a 404 that is
 * indistinguishable from "no such product" is the only answer that does not let
 * an anonymous caller enumerate what is unpublished.
 */
import { sql } from 'drizzle-orm';

import { ProductPlacementQuery } from '../../src/modules/catalog/application/product-placement.query';
import { ProductPlacementService } from '../../src/modules/catalog/application/product-placement.service';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  asAdmin,
  rows,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';
import {
  areaCommand,
  seedBackgroundAsset,
  sideCommand,
} from '../support/product-placement-fixtures';

describe('public placement manifest (live PostgreSQL)', () => {
  let ctx: ApiIntegrationTestContext;
  let placement: ProductPlacementService;
  let publication: ProductPublicationService;
  let query: ProductPlacementQuery;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app3b01-manifest');
    placement = ctx.app.get(ProductPlacementService);
    publication = ctx.app.get(ProductPublicationService);
    query = ctx.app.get(ProductPlacementQuery);
    adminId = await seedAdminId(ctx);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  }, 240_000);

  async function codeOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return (error as { code?: string }).code ?? 'NO_CODE';
    }
    return 'NO_ERROR';
  }

  const slugOf = async (productId: string): Promise<string> => {
    const [row] = await rows<{ slug: string }>(
      ctx,
      sql`select slug from products where id = ${productId}`,
    );
    return row?.slug ?? '';
  };

  /**
   * A published product carrying whatever placement the caller describes.
   *
   * Publication happens **after** placement so the suite proves the two are
   * independent workflows (IMP-D041 PO-06) rather than assuming it.
   */
  async function seedPublished(
    options: {
      readonly background?: Parameters<typeof seedBackgroundAsset>[1];
      readonly withArea?: boolean;
      readonly withPlacement?: boolean;
    } = {},
  ) {
    const product = await asAdmin(ctx, adminId, () => seedPublishableProduct(ctx));
    let updatedAt = product.updatedAt;

    if (options.withPlacement !== false) {
      const backgroundAssetId = await seedBackgroundAsset(ctx, options.background ?? {});
      const view = await asAdmin(ctx, adminId, () =>
        placement.replace({
          productId: product.productId,
          expectedUpdatedAt: new Date(updatedAt),
          sides: [
            sideCommand({
              backgroundAssetId,
              areas: options.withArea === false ? [] : [areaCommand()],
            }),
          ],
        }),
      );
      updatedAt = view.updatedAt;
    }

    const published = await asAdmin(ctx, adminId, () =>
      publication.publish({ productId: product.productId, expectedUpdatedAt: new Date(updatedAt) }),
    );
    return {
      productId: product.productId,
      slug: await slugOf(product.productId),
      updatedAt: published.updatedAt,
    };
  }

  describe('visibility', () => {
    it('does not serve a manifest for an unpublished product', async () => {
      const product = await asAdmin(ctx, adminId, () => seedPublishableProduct(ctx));
      const slug = await slugOf(product.productId);
      expect(await codeOf(() => query.publicRead(slug))).toBe('PUBLIC_PRODUCT_NOT_FOUND');
    });

    it('answers an unknown address exactly as it answers a draft', async () => {
      expect(await codeOf(() => query.publicRead('khong-ton-tai'))).toBe(
        'PUBLIC_PRODUCT_NOT_FOUND',
      );
    });

    it('stops serving the manifest the moment the product is unpublished', async () => {
      const seeded = await seedPublished();
      expect((await query.publicRead(seeded.slug)).studioEligible).toBe(true);

      await asAdmin(ctx, adminId, () =>
        publication.unpublish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(seeded.updatedAt),
        }),
      );
      expect(await codeOf(() => query.publicRead(seeded.slug))).toBe('PUBLIC_PRODUCT_NOT_FOUND');
    });
  });

  describe('studio eligibility', () => {
    it('is true for a complete placement with a READY NORMALIZED background', async () => {
      const seeded = await seedPublished();
      const view = await query.publicRead(seeded.slug);
      expect(view.studioEligible).toBe(true);
      expect(view.sides).toHaveLength(1);
      expect(view.sides[0]?.areas).toHaveLength(1);
    });

    it('is false for a published product with no placement at all', async () => {
      // Publication never required placement, so this is a normal product with
      // a normal manifest — not an error and not fabricated geometry.
      const seeded = await seedPublished({ withPlacement: false });
      const view = await query.publicRead(seeded.slug);
      expect(view.studioEligible).toBe(false);
      expect(view.sides).toEqual([]);
    });

    it('is false when the side has no area', async () => {
      const seeded = await seedPublished({ withArea: false });
      const view = await query.publicRead(seeded.slug);
      expect(view.studioEligible).toBe(false);
      expect(view.sides).toHaveLength(1);
    });

    it('is false when the background derivative has not finished', async () => {
      const seeded = await seedPublished({
        background: { derivativeStatus: 'PENDING', withoutMetadata: true },
      });
      expect((await query.publicRead(seeded.slug)).studioEligible).toBe(false);
    });

    it('is false when the background has no derivative at all', async () => {
      const seeded = await seedPublished({ background: { derivativeKind: null } });
      expect((await query.publicRead(seeded.slug)).studioEligible).toBe(false);
    });

    it('is false for a catalogue derivative, which is not editor-safe', async () => {
      // `CATALOG_PREVIEW` is store marketing media; IMP-D044 PO-01 keeps it out
      // of Studio source however ready it is.
      const seeded = await seedPublished({ background: { derivativeKind: 'CATALOG_PREVIEW' } });
      expect((await query.publicRead(seeded.slug)).studioEligible).toBe(false);
    });

    it('is false for a watermarked derivative', async () => {
      const seeded = await seedPublished({
        background: { derivativeKind: 'PREVIEW_WATERMARKED', watermarked: true },
      });
      expect((await query.publicRead(seeded.slug)).studioEligible).toBe(false);
    });

    it('is false when the source asset was tombstoned after authoring', async () => {
      const seeded = await seedPublished();
      await ctx.database.client.db.execute(sql`
        update assets set deleted_at = now(), status = 'DELETED'
        where id in (select background_asset_id from product_sides
                     where product_id = ${seeded.productId})
      `);
      expect((await query.publicRead(seeded.slug)).studioEligible).toBe(false);
    });

    it('becomes true only once the quartet is present', async () => {
      // The metadata is what the Studio starts its placement scale from, so a
      // derivative without it is ineligible rather than guessed at.
      const seeded = await seedPublished({
        background: { derivativeStatus: 'PROCESSING', withoutMetadata: true },
      });
      expect((await query.publicRead(seeded.slug)).studioEligible).toBe(false);

      await ctx.database.client.db.execute(sql`
        update asset_derivatives
           set status = 'READY',
               storage_key = 'development/derivatives/x/NORMALIZED.webp',
               width_px = 1000, height_px = 1000,
               media_type = 'image/webp', byte_size = 40960
         where asset_id in (select background_asset_id from product_sides
                            where product_id = ${seeded.productId})
      `);
      expect((await query.publicRead(seeded.slug)).studioEligible).toBe(true);
    });
  });

  describe('what the manifest shows', () => {
    it('excludes retired sides and areas', async () => {
      const seeded = await seedPublished();
      const before = await query.publicRead(seeded.slug);
      expect(before.sides).toHaveLength(1);

      await ctx.database.client.db.execute(sql`
        update embroidery_areas set retired_at = now()
         where product_side_id in (select id from product_sides where product_id = ${seeded.productId})
      `);
      const withoutArea = await query.publicRead(seeded.slug);
      expect(withoutArea.sides[0]?.areas).toEqual([]);
      expect(withoutArea.studioEligible).toBe(false);

      await ctx.database.client.db.execute(
        sql`update product_sides set retired_at = now() where product_id = ${seeded.productId}`,
      );
      expect((await query.publicRead(seeded.slug)).sides).toEqual([]);
    });

    it('carries no private, storage or mutation field', async () => {
      const seeded = await seedPublished();
      const serialized = JSON.stringify(await query.publicRead(seeded.slug));
      for (const forbidden of [
        'backgroundAssetId',
        'retiredAt',
        'supersededById',
        'storageKey',
        'storage_key',
        'development/',
        'sha256:',
        'updatedAt',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it('addresses the background by product slug and side code only', async () => {
      const seeded = await seedPublished();
      const view = await query.publicRead(seeded.slug);
      // `APP3-B02` added the delivery block; the address it carries is still
      // composed from the slug and the side code and from nothing private.
      expect(view.sides[0]?.background).toEqual({
        productSlug: seeded.slug,
        sideCode: 'front',
        delivery: {
          path: `/api/public/products/${seeded.slug}/sides/front/background`,
          widthPx: 1000,
          heightPx: 1000,
          mediaType: 'image/webp',
          byteSize: 40960,
        },
      });
    });

    it('is deterministic across repeated reads', async () => {
      const seeded = await seedPublished();
      expect(await query.publicRead(seeded.slug)).toEqual(await query.publicRead(seeded.slug));
    });

    it('orders sides by displayOrder, code, id', async () => {
      const product = await asAdmin(ctx, adminId, () => seedPublishableProduct(ctx));
      const backgroundAssetId = await seedBackgroundAsset(ctx);
      const written = await asAdmin(ctx, adminId, () =>
        placement.replace({
          productId: product.productId,
          expectedUpdatedAt: new Date(product.updatedAt),
          sides: [
            sideCommand({ code: 'sleeve', displayOrder: 2, backgroundAssetId }),
            sideCommand({ code: 'back', displayOrder: 1, backgroundAssetId }),
            sideCommand({ code: 'apron', displayOrder: 1, backgroundAssetId }),
          ],
        }),
      );
      await asAdmin(ctx, adminId, () =>
        publication.publish({
          productId: product.productId,
          expectedUpdatedAt: new Date(written.updatedAt),
        }),
      );

      const view = await query.publicRead(await slugOf(product.productId));
      expect(view.sides.map((side) => side.code)).toEqual(['apron', 'back', 'sleeve']);
    });
  });
});
