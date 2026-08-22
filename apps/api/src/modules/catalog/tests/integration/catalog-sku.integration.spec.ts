/**
 * `APP7-B01` — the SKU write itself, against a real PostgreSQL.
 *
 * What is proved here is that the mutation lands, that the hierarchy and
 * lifecycle checks read database rows rather than the request, and that each
 * mutation leaves exactly one piece of audit evidence.
 *
 * The rules a write is *refused* by have their own file, and the concurrent case
 * a third: they ask different questions, and the concurrency proof needs two
 * independently pooled connections, which is a different harness rather than a
 * different test.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import {
  createConcurrencyTestContext,
  type ConcurrencyActor,
  type ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import { ProductSkuService } from '../../application/product-sku.service';
import {
  activeSkuCount,
  asAdmin,
  codeOf,
  counter,
  seedAdmin,
  seedVariant,
  skuCount,
  SKU_TEST_MODULES,
} from './sku-fixture';

describe('APP7-B01 Admin SKU authoring (integration)', () => {
  let context: ConcurrencyTestContext;
  let actor: ConcurrencyActor;
  let adminId: string;
  let countOf: ReturnType<typeof counter>;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('app7-b01-sku', SKU_TEST_MODULES);
    actor = await context.spawnActor('admin');
    countOf = counter(context.disposable.client.db);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  }, 240_000);

  beforeEach(async () => {
    await context.reset();
    adminId = await seedAdmin(context.disposable.client.db, 'b01');
  });

  const seed = (status?: string) => seedVariant(context.disposable.client.db, status);
  const as = <T>(work: () => Promise<T>) => asAdmin(actor, adminId, work);
  const service = () => actor.get<ProductSkuService>(ProductSkuService);

  describe('the legal path', () => {
    it('creates one order-eligible SKU on a PUBLISHED variant', async () => {
      const seeded = await seed('PUBLISHED');

      const created = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-GAU-NAU-M',
          priceOverrideAmount: '260000',
          isActive: true,
        }),
      );

      // This is the whole point of the checkpoint: a published Catalog variant
      // now resolves to exactly one order-eligible SKU, so `APP7-W01` has a
      // legal `order_items.sku_id` to write.
      expect(created.variantOrderEligibleSkuCount).toBe(1);
      expect(created.code).toBe('TB-GAU-NAU-M');
      expect(created.priceOverrideAmount).toBe('260000.00');
      expect(created.currencyCode).toBe('VND');
      expect(await countOf(activeSkuCount(seeded.variantId))).toBe(1);
    });

    it('creates on a DRAFT product too — SKU authoring is not draft-only', async () => {
      const seeded = await seed('DRAFT');
      const created = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-DRAFT-1',
          isActive: true,
        }),
      );
      expect(created.isActive).toBe(true);
    });

    it('updates the code, the override and the sellable flag', async () => {
      const seeded = await seed();
      const created = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-OLD',
          priceOverrideAmount: '100000',
          isActive: true,
        }),
      );

      const updated = await as(() =>
        service().update({
          skuId: created.skuId,
          fields: { code: 'TB-NEW', priceOverrideAmount: null, isActive: false },
        }),
      );

      expect(updated.code).toBe('TB-NEW');
      expect(updated.priceOverrideAmount).toBeUndefined();
      expect(updated.isActive).toBe(false);
      // Deactivating the only SKU is legal: zero is a state the locked rule
      // handles by refusing conversion, not one this write may forbid.
      expect(updated.variantOrderEligibleSkuCount).toBe(0);
      expect(updated.productVariantId).toBe(seeded.variantId);
    });

    it('advances `updated_at` on every patch', async () => {
      const seeded = await seed();
      const created = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-TOUCH',
          isActive: false,
        }),
      );
      const updated = await as(() =>
        service().update({ skuId: created.skuId, fields: { code: 'TB-TOUCHED' } }),
      );
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.updatedAt).getTime(),
      );
    });

    it('records one audit row per mutation, against the owning product', async () => {
      const seeded = await seed();
      const created = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-AUDIT',
          isActive: true,
        }),
      );
      await as(() => service().update({ skuId: created.skuId, fields: { isActive: false } }));

      expect(
        await countOf(sql`select count(*)::text as count from audit_events
                           where action = 'product.sku_created'
                             and target_kind = 'PRODUCT'
                             and target_id = ${seeded.productId}`),
      ).toBe(1);
      expect(
        await countOf(sql`select count(*)::text as count from audit_events
                           where action = 'product.sku_updated'
                             and target_id = ${seeded.productId}`),
      ).toBe(1);
    });

    it('carries changed-field names in the audit summary, never a value', async () => {
      const seeded = await seed();
      await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-SUMMARY',
          isActive: true,
        }),
      );

      const [row] = (
        await context.disposable.client.db.execute<{ summary: unknown }>(
          sql`select summary from audit_events where action = 'product.sku_created' limit 1`,
        )
      ).rows;
      const summary = JSON.stringify(row?.summary);
      expect(summary).toContain('code');
      // An audit row is evidence, not a second copy of the record it describes.
      expect(summary).not.toContain('TB-SUMMARY');
    });
  });

  describe('hierarchy and lifecycle', () => {
    it('refuses a variant that belongs to another product', async () => {
      const first = await seed();
      const second = await seed();

      expect(
        await codeOf(() =>
          as(() =>
            service().create({
              productId: first.productId,
              // Real variant, real product, wrong pair — every foreign key is
              // satisfied and the write is still illegal.
              variantId: second.variantId,
              code: 'TB-MISMATCH',
              isActive: true,
            }),
          ),
        ),
      ).toBe('SKU_VARIANT_PRODUCT_MISMATCH');
      expect(await countOf(skuCount(second.variantId))).toBe(0);
    });

    it('tells a missing product apart from a missing variant', async () => {
      const seeded = await seed();
      expect(
        await codeOf(() =>
          as(() =>
            service().create({
              productId: newId(),
              variantId: newId(),
              code: 'TB-X',
              isActive: true,
            }),
          ),
        ),
      ).toBe('SKU_PRODUCT_NOT_FOUND');
      expect(
        await codeOf(() =>
          as(() =>
            service().create({
              productId: seeded.productId,
              variantId: newId(),
              code: 'TB-Y',
              isActive: true,
            }),
          ),
        ),
      ).toBe('SKU_VARIANT_NOT_FOUND');
    });

    it('refuses an unknown SKU on update', async () => {
      await seed();
      expect(
        await codeOf(() =>
          as(() => service().update({ skuId: newId(), fields: { isActive: false } })),
        ),
      ).toBe('SKU_NOT_FOUND');
    });

    it('refuses SKU authoring on an ARCHIVED product', async () => {
      const seeded = await seed('ARCHIVED');
      expect(
        await codeOf(() =>
          as(() =>
            service().create({
              productId: seeded.productId,
              variantId: seeded.variantId,
              code: 'TB-ARCHIVED',
              isActive: true,
            }),
          ),
        ),
      ).toBe('SKU_PRODUCT_NOT_AUTHORABLE');
      expect(await countOf(skuCount(seeded.variantId))).toBe(0);
    });
  });
});
