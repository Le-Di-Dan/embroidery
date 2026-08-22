/**
 * `APP7-B01` — the two rules a SKU write is refused by, against a real database.
 *
 * `CST-012` decides code identity and only the database can decide it; the
 * order-eligible invariant decides how many sellable SKUs a variant may carry
 * and only a re-read under the variant's lock can decide that. Both are proved
 * here in the sequential case — what happens when two connections try at once is
 * the race suite's question.
 *
 * Every refusal is also checked for what it left behind, because an invariant
 * enforced by a half-applied write is not enforced at all.
 */
import { sql } from 'drizzle-orm';

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
  seedSiblingVariant,
  seedVariant,
  skuCount,
  SKU_TEST_MODULES,
} from './sku-fixture';

describe('APP7-B01 SKU refusal rules (integration)', () => {
  let context: ConcurrencyTestContext;
  let actor: ConcurrencyActor;
  let adminId: string;
  let countOf: ReturnType<typeof counter>;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('app7-b01-rules', SKU_TEST_MODULES);
    actor = await context.spawnActor('admin');
    countOf = counter(context.disposable.client.db);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  }, 240_000);

  beforeEach(async () => {
    await context.reset();
    adminId = await seedAdmin(context.disposable.client.db, 'b01-rules');
  });

  const seed = () => seedVariant(context.disposable.client.db);
  const as = <T>(work: () => Promise<T>) => asAdmin(actor, adminId, work);
  const service = () => actor.get<ProductSkuService>(ProductSkuService);

  describe('duplicate SKU code', () => {
    it('refuses a code already in use, anywhere in the catalog', async () => {
      const first = await seed();
      const second = await seed();
      await as(() =>
        service().create({
          productId: first.productId,
          variantId: first.variantId,
          code: 'TB-DUP',
          isActive: true,
        }),
      );

      // A different product, a different variant: `CST-012` is global, so the
      // refusal must not depend on the two SKUs sharing a parent.
      expect(
        await codeOf(() =>
          as(() =>
            service().create({
              productId: second.productId,
              variantId: second.variantId,
              code: 'TB-DUP',
              isActive: false,
            }),
          ),
        ),
      ).toBe('SKU_CODE_CONFLICT');
      expect(await countOf(skuCount(second.variantId))).toBe(0);
    });

    it('refuses a patch that renames a SKU onto an existing code', async () => {
      const seeded = await seed();
      await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-TAKEN',
          isActive: true,
        }),
      );
      const other = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-FREE',
          isActive: false,
        }),
      );

      expect(
        await codeOf(() =>
          as(() => service().update({ skuId: other.skuId, fields: { code: 'TB-TAKEN' } })),
        ),
      ).toBe('SKU_CODE_CONFLICT');
      expect(
        await countOf(
          sql`select count(*)::text as count from skus
               where id = ${other.skuId} and code = 'TB-FREE'`,
        ),
      ).toBe(1);
    });

    it('keeps the code bytewise exact — no case folding, no trimming', async () => {
      const seeded = await seed();
      await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'tb-case',
          isActive: true,
        }),
      );
      // `IDX-014` compares bytewise (ADR-DB5-002 R2), so these are two distinct
      // identifiers and the second is accepted rather than reported as a clash.
      const upper = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-CASE',
          isActive: false,
        }),
      );
      expect(upper.code).toBe('TB-CASE');
    });
  });

  describe('the order-eligible invariant', () => {
    it('refuses a second order-eligible SKU on the same variant', async () => {
      const seeded = await seed();
      await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-ONE',
          isActive: true,
        }),
      );

      expect(
        await codeOf(() =>
          as(() =>
            service().create({
              productId: seeded.productId,
              variantId: seeded.variantId,
              code: 'TB-TWO',
              isActive: true,
            }),
          ),
        ),
      ).toBe('SKU_ORDER_ELIGIBLE_AMBIGUOUS');

      // Rolled back whole: no second row, and the code it would have claimed is
      // still free.
      expect(await countOf(skuCount(seeded.variantId))).toBe(1);
      expect(
        await countOf(sql`select count(*)::text as count from skus where code = 'TB-TWO'`),
      ).toBe(0);
    });

    it('allows a second inactive SKU, then refuses activating it', async () => {
      const seeded = await seed();
      await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-LIVE',
          isActive: true,
        }),
      );
      const spare = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-SPARE',
          isActive: false,
        }),
      );

      expect(
        await codeOf(() =>
          as(() => service().update({ skuId: spare.skuId, fields: { isActive: true } })),
        ),
      ).toBe('SKU_ORDER_ELIGIBLE_AMBIGUOUS');
      expect(await countOf(activeSkuCount(seeded.variantId))).toBe(1);
    });

    it('lets the operator hand the slot over: deactivate, then activate', async () => {
      const seeded = await seed();
      const live = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-A',
          isActive: true,
        }),
      );
      const spare = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-B',
          isActive: false,
        }),
      );

      await as(() => service().update({ skuId: live.skuId, fields: { isActive: false } }));
      const promoted = await as(() =>
        service().update({ skuId: spare.skuId, fields: { isActive: true } }),
      );

      expect(promoted.variantOrderEligibleSkuCount).toBe(1);
      expect(await countOf(activeSkuCount(seeded.variantId))).toBe(1);
    });

    it('re-patching the already-active SKU is not treated as a second one', async () => {
      const seeded = await seed();
      const live = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-IDEM',
          isActive: true,
        }),
      );
      const again = await as(() =>
        service().update({ skuId: live.skuId, fields: { isActive: true } }),
      );
      expect(again.variantOrderEligibleSkuCount).toBe(1);
    });

    it('leaves a sibling variant alone — the invariant is per variant', async () => {
      const seeded = await seed();
      const siblingId = await seedSiblingVariant(context.disposable.client.db, seeded.productId);

      await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-M',
          isActive: true,
        }),
      );
      const sibling = await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: siblingId,
          code: 'TB-L',
          isActive: true,
        }),
      );

      expect(sibling.variantOrderEligibleSkuCount).toBe(1);
      expect(await countOf(activeSkuCount(seeded.variantId))).toBe(1);
      expect(await countOf(activeSkuCount(siblingId))).toBe(1);
    });

    it('writes no audit row for a refused mutation', async () => {
      const seeded = await seed();
      await as(() =>
        service().create({
          productId: seeded.productId,
          variantId: seeded.variantId,
          code: 'TB-KEEP',
          isActive: true,
        }),
      );
      await codeOf(() =>
        as(() =>
          service().create({
            productId: seeded.productId,
            variantId: seeded.variantId,
            code: 'TB-REFUSED',
            isActive: true,
          }),
        ),
      );

      // One create succeeded, one was refused: the audit trail must show the
      // one that happened and nothing else.
      expect(
        await countOf(sql`select count(*)::text as count from audit_events
                           where action = 'product.sku_created'
                             and target_id = ${seeded.productId}`),
      ).toBe(1);
    });
  });
});
