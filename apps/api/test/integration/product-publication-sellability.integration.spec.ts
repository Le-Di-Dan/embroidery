/**
 * `APP12-N02.B01` — the three sellability requirements, end to end against a
 * real PostgreSQL.
 *
 * The domain matrix is proved without a database in
 * `product-publication.sellability.spec.ts`. What needs a live one is exactly
 * the set of claims a pure function cannot make:
 *
 * - the readiness GET and the publish transaction agree, because they run one
 *   evaluator over one snapshot rather than two code paths that must be kept
 *   in step by inspection;
 * - the facts really are read from `product_variants` and `skus`;
 * - stock changes nothing — not a zero quantity, not a missing anchor row, not
 *   an unset threshold — and the proof is that the rows exist in the database
 *   while the verdict does not move;
 * - a PUBLISHED Product that fails the new requirements is left exactly as it
 *   is, and can still be unpublished.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';

describe('publication sellability (live PostgreSQL)', () => {
  let ctx: ApiIntegrationTestContext;
  let adminId: string;
  let publication: ProductPublicationService;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app12n02b01-sellability');
    publication = ctx.app.get(ProductPublicationService);
    adminId = await seedAdminId(ctx);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  }, 240_000);

  /** The domain error code a call refused with, or why it did not refuse. */
  async function codeOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return (error as { code?: string }).code ?? 'NO_CODE';
    }
    return 'NO_ERROR';
  }

  const db = () => ctx.database.client.db;

  const failures = async (productId: string): Promise<string[]> =>
    (await publication.readiness(productId)).requirements
      .filter((requirement) => !requirement.satisfied)
      .map((requirement) => requirement.code);

  const publish = (productId: string, updatedAt: string) =>
    asAdmin(ctx, adminId, () =>
      publication.publish({ productId, expectedUpdatedAt: new Date(updatedAt) }),
    );

  const statusOf = async (productId: string): Promise<string> => {
    const rows = await db().execute<{ status: string }>(
      sql`select status from products where id = ${productId}`,
    );
    return String(rows.rows[0]?.status);
  };

  describe('the readiness report and the publish transaction agree', () => {
    it('publishes a product whose structure a customer could buy', async () => {
      const seeded = await seedPublishableProduct(ctx);
      expect(await failures(seeded.productId)).toEqual([]);

      const published = await publish(seeded.productId, seeded.updatedAt);
      expect(published.status).toBe('PUBLISHED');
    });

    it('refuses a product with no active variant, and reports the same code', async () => {
      const seeded = await seedPublishableProduct(ctx, { sellable: false });
      expect(await failures(seeded.productId)).toEqual(['HAS_ACTIVE_VARIANT']);

      expect(await codeOf(() => publish(seeded.productId, seeded.updatedAt))).toBe(
        'PRODUCT_PUBLICATION_NOT_READY',
      );
      expect(await statusOf(seeded.productId)).toBe('DRAFT');
    });

    it('refuses a product whose only variant has been deactivated', async () => {
      const seeded = await seedPublishableProduct(ctx);
      await db().execute(
        sql`update product_variants set is_active = false where id = ${seeded.variantId}`,
      );
      expect(await failures(seeded.productId)).toEqual(['HAS_ACTIVE_VARIANT']);
      expect(await codeOf(() => publish(seeded.productId, seeded.updatedAt))).toBe(
        'PRODUCT_PUBLICATION_NOT_READY',
      );
    });

    it('refuses an active variant whose only SKU has been deactivated', async () => {
      const seeded = await seedPublishableProduct(ctx);
      await db().execute(sql`update skus set is_active = false where id = ${seeded.skuId}`);
      expect(await failures(seeded.productId)).toEqual(['HAS_ORDER_ELIGIBLE_SKU']);
      expect(await codeOf(() => publish(seeded.productId, seeded.updatedAt))).toBe(
        'PRODUCT_PUBLICATION_NOT_READY',
      );
    });

    it('refuses a zero-đồng override while the base price requirement stays green', async () => {
      const seeded = await seedPublishableProduct(ctx);
      // A real, accepted value: `price_override_amount` is validated as
      // `^\d{1,12}$` and `ck_skus__price_override_non_negative` admits zero, so
      // this row is one an operator can actually create.
      await db().execute(
        sql`update skus set price_override_amount = '0' where id = ${seeded.skuId}`,
      );

      expect(await failures(seeded.productId)).toEqual(['SKU_PRICE_RESOLVABLE']);
      expect(await codeOf(() => publish(seeded.productId, seeded.updatedAt))).toBe(
        'PRODUCT_PUBLICATION_NOT_READY',
      );
    });

    it('sees a repair made after the refusal, because publish re-reads the rows', async () => {
      const seeded = await seedPublishableProduct(ctx, { sellable: false });
      expect(await codeOf(() => publish(seeded.productId, seeded.updatedAt))).toBe(
        'PRODUCT_PUBLICATION_NOT_READY',
      );

      const variantId = newId();
      const skuId = newId();
      await db().execute(sql`
        insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
        values (${variantId}, ${seeded.productId}, 'Trắng', 'M', 0, true)
      `);
      await db().execute(sql`
        insert into skus (id, product_variant_id, code, price_override_amount, currency_code, is_active)
        values (${skuId}, ${variantId}, ${`FIX-${skuId.slice(-8)}`}, null, 'VND', true)
      `);

      // The token is unchanged: seeding a variant does not touch the Product
      // row, so the same publish command that was refused now succeeds.
      const published = await publish(seeded.productId, seeded.updatedAt);
      expect(published.status).toBe('PUBLISHED');
    });
  });

  describe('stock is not publication authority', () => {
    /** The stock anchor `sku_stocks` is, with the quantity and threshold given. */
    async function seedStock(
      skuId: string,
      quantityOnHand: number,
      lowStockThreshold: number | null,
    ): Promise<void> {
      await db().execute(sql`
        insert into sku_stocks (id, sku_id, quantity_on_hand, low_stock_threshold)
        values (${newId()}, ${skuId}, ${quantityOnHand}, ${lowStockThreshold})
      `);
    }

    it('publishes a sold-out product — stock 0 with an unset threshold', async () => {
      const seeded = await seedPublishableProduct(ctx);
      await seedStock(String(seeded.skuId), 0, null);

      expect(await failures(seeded.productId)).toEqual([]);
      expect((await publish(seeded.productId, seeded.updatedAt)).status).toBe('PUBLISHED');
    });

    it('publishes with no stock anchor row at all', async () => {
      const seeded = await seedPublishableProduct(ctx);
      const rows = await db().execute<{ count: string }>(
        sql`select count(*)::text as count from sku_stocks where sku_id = ${seeded.skuId}`,
      );
      // The anchor is created by Admin stock initialisation, not lazily, so a
      // freshly authored SKU genuinely has none.
      expect(Number(rows.rows[0]?.count)).toBe(0);

      expect(await failures(seeded.productId)).toEqual([]);
      expect((await publish(seeded.productId, seeded.updatedAt)).status).toBe('PUBLISHED');
    });

    it('reports the identical requirement list at stock 0 and at stock 12', async () => {
      // The two frames the design draws side by side (`N02.D01` §J.2, D and E).
      const soldOut = await seedPublishableProduct(ctx);
      await seedStock(String(soldOut.skuId), 0, 3);
      const inStock = await seedPublishableProduct(ctx);
      await seedStock(String(inStock.skuId), 12, 3);

      const [a, b] = [
        await publication.readiness(soldOut.productId),
        await publication.readiness(inStock.productId),
      ];
      expect(a.requirements).toEqual(b.requirements);
      expect(a.eligible).toBe(true);
      expect(b.eligible).toBe(true);
    });
  });

  describe('an already-published product that fails the new requirements', () => {
    /** A PUBLISHED row with no variant — the shape `N02.G01` found live. */
    async function seedMalformedPublished(): Promise<{ productId: string; updatedAt: string }> {
      const seeded = await seedPublishableProduct(ctx);
      const published = await publish(seeded.productId, seeded.updatedAt);
      // Deactivated *after* publication, which is how a live product becomes
      // structurally unsellable in the first place.
      await db().execute(
        sql`update product_variants set is_active = false where id = ${seeded.variantId}`,
      );
      return { productId: published.productId, updatedAt: published.updatedAt };
    }

    it('is left published — nothing auto-unpublishes it', async () => {
      const malformed = await seedMalformedPublished();
      expect(await statusOf(malformed.productId)).toBe('PUBLISHED');

      // Reading readiness is not a repair either: it writes nothing.
      expect(await failures(malformed.productId)).toEqual(['HAS_ACTIVE_VARIANT']);
      expect(await statusOf(malformed.productId)).toBe('PUBLISHED');
    });

    it('can still be unpublished, because unpublish never re-runs readiness', async () => {
      const malformed = await seedMalformedPublished();

      const unpublished = await asAdmin(ctx, adminId, () =>
        publication.unpublish({
          productId: malformed.productId,
          expectedUpdatedAt: new Date(malformed.updatedAt),
        }),
      );
      expect(unpublished.status).toBe('DRAFT');
    });

    it('can be repaired in place and republished without ever being withdrawn', async () => {
      const malformed = await seedMalformedPublished();
      // Reactivating the variant is enough; the product never left the
      // storefront, and no `unpublish → edit → republish` cycle was needed.
      await db().execute(
        sql`update product_variants set is_active = true where product_id = ${malformed.productId}`,
      );
      expect(await failures(malformed.productId)).toEqual([]);
      expect(await statusOf(malformed.productId)).toBe('PUBLISHED');
    });
  });
});
