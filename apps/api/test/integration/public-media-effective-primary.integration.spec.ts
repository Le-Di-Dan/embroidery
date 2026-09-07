/**
 * `APP12-M01-B1` — one effective-primary rule, and the second rendition that
 * rule now has to carry.
 *
 * ## The defect this pins down
 *
 * `APP12-M01.A` published a Product with thirty images, set its stored
 * `THUMBNAIL` asset to `REJECTED`, and read three public surfaces. They gave
 * three different answers: the Discover card resolved `role = 'THUMBNAIL'`
 * strictly and so showed **no image at all** while the Product stayed listed and
 * purchasable, the detail gallery quietly dropped the row and led with the next
 * one, and `og:image` — which reads the first element of that same gallery —
 * silently substituted it. No single query was wrong; they simply did not share
 * a definition of "primary".
 *
 * ## Why it needs a database
 *
 * The rule is expressed as an ORDER BY inside a correlated subquery and as the
 * ORDER BY of a second statement, and the claim is that **those two orderings
 * pick the same row**. A double would prove that a mapper copies what it is
 * handed. Only real PostgreSQL proves the right row was handed to it, and only
 * a real publish proves the state is reachable at all.
 *
 * ## What makes each claim falsifiable
 *
 * Three images, seeded in a known order, with **distinct dimensions per
 * position** — so "which image is primary" is answered by a number rather than
 * by an address the reader has to match up by eye. The two derivatives of one
 * asset also carry deliberately different sizes, so a projection that read the
 * wrong rendition would produce the *other* pair rather than a subtly wrong one.
 *
 * Degradation is applied three different ways — a rejected asset, a tombstoned
 * asset, and a derivative that never became `READY` — because the rule is about
 * eligibility, not about one column. A test that only rejected the asset would
 * pass against an implementation that special-cased `status`.
 */
import { sql } from 'drizzle-orm';

import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { PublicProductMediaService } from '../../src/modules/catalog/application/public-product-media.service';
import { PublicProductQuery } from '../../src/modules/catalog/application/public-product.query';
import { createPublicMediaContext } from '../support/public-media-context';
import type { PublicMediaTestContext } from '../support/public-media-context';
import {
  asAdmin,
  seedAdminId,
  seedAsset,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';

jest.setTimeout(300_000);

/** Position-distinct sizes: the number identifies which image answered. */
const SIZES = [
  { THUMBNAIL: { width: 401, height: 501 }, CATALOG_PREVIEW: { width: 1601, height: 2001 } },
  { THUMBNAIL: { width: 402, height: 502 }, CATALOG_PREVIEW: { width: 1602, height: 2002 } },
  { THUMBNAIL: { width: 403, height: 503 }, CATALOG_PREVIEW: { width: 1603, height: 2003 } },
] as const;

describe('APP12-M01-B1 effective primary and detail thumbnail rendition (integration)', () => {
  let ctx: PublicMediaTestContext;
  let adminId: string;
  let catalog: PublicProductQuery;
  let publication: ProductPublicationService;

  beforeAll(async () => {
    ctx = await createPublicMediaContext('m01b1-effective-primary');
    catalog = ctx.api.app.get(PublicProductQuery);
    publication = ctx.api.app.get(ProductPublicationService);
    // Nothing here logs in — every read under test is anonymous — so the
    // operator exists only to attribute the publish transition. One row, seeded
    // directly: `uq_admin_accounts__status__active` permits exactly one ACTIVE
    // account, so bootstrapping *and* seeding would collide on the constraint.
    adminId = await seedAdminId(ctx.api);
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

  interface PublishedProduct {
    readonly slug: string;
    readonly productId: string;
    readonly assetIds: readonly string[];
  }

  /**
   * Publishes one Product carrying three deliverable images, in a known order.
   *
   * Published through the real service, so every image satisfies the real
   * publication requirements before anything is degraded — which is what makes
   * the degraded state a *reachable* one rather than a fixture artefact.
   */
  async function publishThreeImageProduct(): Promise<PublishedProduct> {
    const assetIds: string[] = [];
    for (const dimensions of SIZES) {
      const assetId = await seedAsset(ctx.api, { dimensions });
      for (const kind of ['THUMBNAIL', 'CATALOG_PREVIEW']) {
        await ctx.putDerivative(assetId, kind, Buffer.from(`webp:${assetId}:${kind}`, 'utf8'));
      }
      assetIds.push(assetId);
    }
    const seeded = await seedPublishableProduct(ctx.api, { mediaAssetIds: assetIds });
    await asAdmin(ctx.api, adminId, () =>
      publication.publish({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      }),
    );
    const [row] = (
      await ctx.api.database.client.db.execute(
        sql`select slug from products where id = ${seeded.productId}`,
      )
    ).rows as { slug: string }[];
    if (row === undefined) throw new Error('seeded product not found');
    return { slug: row.slug, productId: seeded.productId, assetIds };
  }

  /** The card as the Discover feed would read it. */
  async function card(slug: string) {
    const page = await catalog.list({ limit: 200 });
    return page.items.find((item) => item.slug === slug);
  }

  /** The stored association rows, so a read can be proved not to have written. */
  async function storedMedia(productId: string) {
    return (
      await ctx.api.database.client.db.execute(
        sql`select asset_id, role, display_order from product_media
            where product_id = ${productId} order by display_order`,
      )
    ).rows as { asset_id: string; role: string; display_order: number }[];
  }

  describe('the healthy case is unchanged', () => {
    it('leads with the stored THUMBNAIL on the card, the page and the SEO array', async () => {
      const { slug } = await publishThreeImageProduct();

      const summary = await card(slug);
      // Position 1's size, so the assertion names *which* image answered.
      expect(summary?.thumbnail?.width).toBe(SIZES[0].THUMBNAIL.width);
      expect(summary?.thumbnail?.role).toBe('THUMBNAIL');

      const detail = await catalog.detail(slug);
      expect(detail.media).toHaveLength(3);
      expect(detail.media[0]?.width).toBe(SIZES[0].CATALOG_PREVIEW.width);
      // The remaining images keep their persisted order.
      expect(detail.media.map((item) => item.width)).toEqual([
        SIZES[0].CATALOG_PREVIEW.width,
        SIZES[1].CATALOG_PREVIEW.width,
        SIZES[2].CATALOG_PREVIEW.width,
      ]);
      // Exactly one item claims the primary role, and it is the first.
      expect(detail.media.map((item) => item.role)).toEqual(['THUMBNAIL', 'GALLERY', 'GALLERY']);
    });
  });

  describe('the detail item carries both renditions', () => {
    it('addresses one association twice, each with its own derivative size', async () => {
      const { slug } = await publishThreeImageProduct();
      const detail = await catalog.detail(slug);

      for (const [index, item] of detail.media.entries()) {
        const expected = SIZES[index]!;
        expect(item.url).toContain('/catalog-preview');
        expect(item.thumbnailUrl).toContain('/thumbnail');
        // Same association id in both addresses — only the rendition differs.
        const association = item.url.split('/media/')[1]?.split('/')[0];
        expect(item.thumbnailUrl).toContain(`/media/${association}/`);
        // And the sizes are the two *different* stored pairs, so reading the
        // wrong derivative would swap the numbers rather than hide the error.
        expect([item.width, item.height]).toEqual([
          expected.CATALOG_PREVIEW.width,
          expected.CATALOG_PREVIEW.height,
        ]);
        expect([item.thumbnailWidth, item.thumbnailHeight]).toEqual([
          expected.THUMBNAIL.width,
          expected.THUMBNAIL.height,
        ]);
      }
    });

    it('publishes only addresses the delivery route actually resolves', async () => {
      const { slug } = await publishThreeImageProduct();
      const detail = await catalog.detail(slug);
      const media = ctx.api.app.get(PublicProductMediaService);

      // Every published address is opened through the **real delivery service**,
      // not merely inspected as a string. This is the assertion the projection
      // and the query layer cannot make between them: `M01-B1` published a
      // `thumbnailUrl` for every gallery image while the route still restricted
      // that rendition to the stored `THUMBNAIL` association, so nineteen of
      // twenty small addresses answered 404 on a real page. A contract that
      // advertises an address it cannot serve is the one media defect a JSON
      // payload can create entirely on its own.
      for (const item of detail.media) {
        for (const address of [item.url, item.thumbnailUrl]) {
          expect(address).toBeDefined();
          const [productMediaId, rendition] = address!.split('/media/')[1]!.split('/');
          const opened = await media.open(
            {
              slug,
              productMediaId: productMediaId!,
              rendition: rendition as 'thumbnail' | 'catalog-preview',
            },
            new AbortController().signal,
          );
          expect(opened.contentType).toBe('image/webp');
          // Release the provider connection; the assertion is that it opened.
          opened.body.destroy();
        }
      }
    });

    it('omits the thumbnail address, and demotes the image, when that derivative is not deliverable', async () => {
      const { slug, assetIds } = await publishThreeImageProduct();
      // The small rendition of the *middle* image alone becomes unserveable.
      await ctx.api.database.client.db.execute(
        sql`update asset_derivatives set status = 'PENDING'
            where asset_id = ${assetIds[1]!} and kind = 'THUMBNAIL'`,
      );

      const detail = await catalog.detail(slug);
      // It keeps its place in the gallery — its preview is still fine, so the
      // visitor loses a position, never a photograph.
      expect(detail.media).toHaveLength(3);

      const degraded = detail.media.find((item) => item.width === SIZES[1].CATALOG_PREVIEW.width);
      expect(degraded).toBeDefined();
      // No thumbnail address and no thumbnail size: the client falls back to
      // the preview for that one strip control rather than losing the image.
      expect(degraded).not.toHaveProperty('thumbnailUrl');
      expect(degraded).not.toHaveProperty('thumbnailWidth');

      // And it sorts **last**, because `PUBLIC_EFFECTIVE_PRIMARY_ORDER` key 1
      // demotes an image that is not serveable at both renditions. That is what
      // stops a half-broken image from becoming a primary the card could
      // advertise and this page could not render.
      expect(detail.media[2]?.width).toBe(SIZES[1].CATALOG_PREVIEW.width);
      expect(detail.media.map((item) => item.width)).toEqual([
        SIZES[0].CATALOG_PREVIEW.width,
        SIZES[2].CATALOG_PREVIEW.width,
        SIZES[1].CATALOG_PREVIEW.width,
      ]);
      // Its complete neighbours are untouched.
      expect(detail.media[0]?.thumbnailUrl).toContain('/thumbnail');
      expect(detail.media[1]?.thumbnailUrl).toContain('/thumbnail');
    });

    it('never lets a half-broken image become the primary the card advertises', async () => {
      const { slug, assetIds } = await publishThreeImageProduct();
      // The stored primary keeps a serveable thumbnail and loses its preview:
      // the exact shape that used to split the two surfaces, because the card
      // renders one rendition and the page renders the other.
      await ctx.api.database.client.db.execute(
        sql`update asset_derivatives set status = 'FAILED'
            where asset_id = ${assetIds[0]!} and kind = 'CATALOG_PREVIEW'`,
      );

      const summary = await card(slug);
      const detail = await catalog.detail(slug);

      // The card no longer advertises an image the product page cannot show.
      expect(summary?.thumbnail?.width).toBe(SIZES[1].THUMBNAIL.width);
      expect(detail.media[0]?.width).toBe(SIZES[1].CATALOG_PREVIEW.width);
      const cardAssociation = summary?.thumbnail?.url.split('/media/')[1]?.split('/')[0];
      const detailAssociation = detail.media[0]?.url.split('/media/')[1]?.split('/')[0];
      expect(cardAssociation).toBe(detailAssociation);
    });
  });

  describe('a degraded canonical primary', () => {
    /** Every way an image can stop being deliverable, as its own case. */
    const degradations: readonly {
      readonly name: string;
      readonly apply: (assetId: string) => Promise<unknown>;
    }[] = [
      {
        name: 'the asset is rejected',
        apply: (assetId) =>
          ctx.api.database.client.db.execute(
            sql`update assets set status = 'REJECTED' where id = ${assetId}`,
          ),
      },
      {
        name: 'the asset is tombstoned',
        apply: (assetId) =>
          ctx.api.database.client.db.execute(
            sql`update assets set deleted_at = now() where id = ${assetId}`,
          ),
      },
      {
        name: 'its catalog preview is no longer ready',
        apply: (assetId) =>
          ctx.api.database.client.db.execute(
            sql`update asset_derivatives set status = 'FAILED'
                where asset_id = ${assetId} and kind = 'CATALOG_PREVIEW'`,
          ),
      },
    ];

    for (const { name, apply } of degradations) {
      it(`promotes the next eligible image on every surface when ${name}`, async () => {
        const { slug, assetIds } = await publishThreeImageProduct();
        await apply(assetIds[0]!);

        // 1. The card. This is the surface that used to show nothing at all.
        const summary = await card(slug);
        expect(summary).toBeDefined();
        expect(summary?.thumbnail).toBeDefined();
        expect(summary?.thumbnail?.width).toBe(SIZES[1].THUMBNAIL.width);

        // 2. The detail array, whose first element is what `og:image` and the
        //    JSON-LD image list are both built from.
        const detail = await catalog.detail(slug);
        expect(detail.media).toHaveLength(2);
        expect(detail.media[0]?.width).toBe(SIZES[1].CATALOG_PREVIEW.width);
        expect(detail.media[1]?.width).toBe(SIZES[2].CATALOG_PREVIEW.width);

        // 3. And the two agree — the whole point of the rule. Asserted as the
        //    same association id rather than as two sizes that happen to match.
        const cardAssociation = summary?.thumbnail?.url.split('/media/')[1]?.split('/')[0];
        const detailAssociation = detail.media[0]?.url.split('/media/')[1]?.split('/')[0];
        expect(cardAssociation).toBe(detailAssociation);

        // 4. The published role follows the effective primary, so a client that
        //    trusts `role` and a client that trusts position agree too.
        expect(detail.media.map((item) => item.role)).toEqual(['THUMBNAIL', 'GALLERY']);
      });
    }

    it('writes nothing: the stored rows, roles and order are exactly as the operator left them', async () => {
      const { slug, productId, assetIds } = await publishThreeImageProduct();
      const before = await storedMedia(productId);
      await ctx.api.database.client.db.execute(
        sql`update assets set status = 'REJECTED' where id = ${assetIds[0]!}`,
      );

      // Read every public surface, twice, including the promotion path.
      await card(slug);
      await catalog.detail(slug);
      await card(slug);
      await catalog.detail(slug);

      // No promotion was persisted, no role rewritten, no row removed. The
      // effective primary is a property of the read; recovering the asset
      // restores the operator's original choice with no repair step.
      expect(await storedMedia(productId)).toEqual(before);
      expect(before.map((row) => row.role)).toEqual(['THUMBNAIL', 'GALLERY', 'GALLERY']);
    });

    it('restores the original primary the moment the asset becomes eligible again', async () => {
      const { slug, assetIds } = await publishThreeImageProduct();
      await ctx.api.database.client.db.execute(
        sql`update assets set status = 'REJECTED' where id = ${assetIds[0]!}`,
      );
      expect((await card(slug))?.thumbnail?.width).toBe(SIZES[1].THUMBNAIL.width);

      await ctx.api.database.client.db.execute(
        sql`update assets set status = 'ACCEPTED' where id = ${assetIds[0]!}`,
      );

      expect((await card(slug))?.thumbnail?.width).toBe(SIZES[0].THUMBNAIL.width);
      expect((await catalog.detail(slug)).media[0]?.width).toBe(SIZES[0].CATALOG_PREVIEW.width);
    });
  });

  describe('no eligible media at all', () => {
    it('keeps the deliberate no-image fallback rather than inventing an address', async () => {
      const { slug, assetIds } = await publishThreeImageProduct();
      await ctx.api.database.client.db.execute(
        sql`update assets set status = 'REJECTED' where id in (${sql.join(
          assetIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

      const summary = await card(slug);
      // Still published and still listed — publication is evaluated at publish
      // time and this read does not withdraw it — but with no fabricated URL.
      expect(summary).toBeDefined();
      expect(summary).not.toHaveProperty('thumbnail');

      const detail = await catalog.detail(slug);
      expect(detail.media).toEqual([]);
    });
  });

  describe('the additive fields leak nothing', () => {
    it('carries no storage key, bucket or checksum in either address', async () => {
      const { slug } = await publishThreeImageProduct();
      const payload = JSON.stringify({
        card: await card(slug),
        detail: await catalog.detail(slug),
      });

      for (const forbidden of [
        'storageKey',
        'storage_key',
        'bucket',
        'checksum',
        'sha256',
        'originals/',
        'derivatives/',
        's3',
        'minio',
        'http://',
        'https://',
      ]) {
        expect(payload).not.toContain(forbidden);
      }
      // Both addresses are relative application paths on the delivery route.
      const detail = await catalog.detail(slug);
      for (const item of detail.media) {
        expect(item.url.startsWith('/api/public/products/')).toBe(true);
        expect(item.thumbnailUrl?.startsWith('/api/public/products/')).toBe(true);
      }
    });
  });
});
