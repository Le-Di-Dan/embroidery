/**
 * `APP12-B01` — the public purchasable SKU projection, against real PostgreSQL.
 *
 * A double would prove the query calls what it calls. Only a database proves the
 * two properties the checkpoint actually turns on: that the availability figure
 * a customer is shown is the same arithmetic the `APP8` writer refuses a hold
 * against, over the same rows and the same active states; and that an anonymous
 * `GET` on a SKU with no stock anchor leaves the inventory tables exactly as it
 * found them.
 *
 * ## Why it borrows the Inventory fixture
 *
 * A soft hold needs a `custom_requests` row and a reservation needs an `orders`
 * row, and an order needs a customer, a quotation, a design case, an approval
 * snapshot and a satisfied deposit obligation before its foreign keys are
 * satisfied. `seedInventoryChain` already seeds exactly that chain, and it hangs
 * it off a `PUBLISHED` product in a `PUBLISHED` category — which is also a public
 * catalog address. Re-seeding it here would be a second copy of a chain whose
 * only interesting property is that it exists.
 *
 * The suite compiles `CatalogPublicModule` — the real graph, the real
 * repository, the real availability adapter, real SQL.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { seedInventoryChain } from '../../../inventory/tests/integration/inventory-fixture';
import type { InventoryFixture } from '../../../inventory/tests/integration/inventory-fixture';
import { CatalogPublicModule } from '../../catalog-public.module';
import { PublicProductVariantQuery } from '../../application/public-product-variant.query';
import type { PublicProductSkuView } from '../../application/public-product-variant.query';

describe('APP12-B01 public purchasable SKU projection (integration)', () => {
  let context: PersistenceTestContext;
  let query: PublicProductVariantQuery;
  let chain: InventoryFixture;

  beforeAll(async () => {
    context = await createPersistenceTestContext('app12-b01-purchasable-sku', [
      CatalogPublicModule,
    ]);
    query = context.get(PublicProductVariantQuery);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    chain = await seedInventoryChain(context);
  });

  afterEach(async () => {
    await context.reset();
  });

  const db = (): PersistenceTestContext['disposable']['client']['db'] =>
    context.disposable.client.db;

  /** A second SKU on the chain's variant. Active unless told otherwise. */
  async function addSku(
    options: { readonly priceOverrideAmount?: string; readonly isActive?: boolean } = {},
  ): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into skus (id, product_variant_id, code, price_override_amount, currency_code, is_active)
      values (${id}, ${chain.productVariantId}, ${`SKU-${id}`},
              ${options.priceOverrideAmount ?? null}, 'VND', ${options.isActive ?? true})
    `);
    return id;
  }

  /** The `sku_stocks` anchor. Its absence is a scenario, so it is never implicit. */
  async function anchor(skuId: string, quantityOnHand: number): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into sku_stocks (id, sku_id, quantity_on_hand)
      values (${id}, ${skuId}, ${quantityOnHand})
    `);
    return id;
  }

  async function hold(
    skuStockId: string,
    quantity: number,
    status: 'HELD' | 'CONVERTED' | 'RELEASED' | 'EXPIRED',
  ): Promise<void> {
    await db().execute(sql`
      insert into inventory_soft_holds
        (id, sku_stock_id, custom_request_id, quantity, status, expires_at, released_reason)
      values (${newId()}, ${skuStockId}, ${chain.customRequestId}, ${quantity}, ${status},
              now() + interval '1 hour',
              ${status === 'RELEASED' ? 'test release' : null})
    `);
  }

  async function reservation(
    skuStockId: string,
    quantity: number,
    status: 'RESERVED' | 'CONSUMED' | 'RELEASED' | 'EXPIRED',
  ): Promise<void> {
    await db().execute(sql`
      insert into inventory_reservations
        (id, sku_stock_id, order_id, quantity, status, released_reason)
      values (${newId()}, ${skuStockId}, ${chain.orderId}, ${quantity}, ${status},
              ${status === 'RELEASED' ? 'test release' : null})
    `);
  }

  /** `select count(*)::text as count …` → a number. */
  async function countOf(statement: ReturnType<typeof sql>): Promise<number> {
    const result = await db().execute(statement);
    const rows = (result as unknown as { rows?: { count: string }[] }).rows ?? [];
    return Number(rows[0]?.count ?? '0');
  }

  /** Every SKU projected under the chain's product, keyed by id. */
  async function projectedSkus(): Promise<Map<string, PublicProductSkuView>> {
    const view = await query.publicRead(chain.productSlug);
    return new Map(
      view.variants.flatMap((variant) => variant.skus.map((sku) => [sku.skuId, sku] as const)),
    );
  }

  describe('availability is the APP8 balance, not a second arithmetic', () => {
    it('subtracts active holds and active reservations from on hand', async () => {
      // The §27 A matrix: 10 on hand, 2 held, 3 reserved → 5.
      const stockId = await anchor(chain.skuId, 10);
      await hold(stockId, 2, 'HELD');
      await reservation(stockId, 3, 'RESERVED');

      expect((await projectedSkus()).get(chain.skuId)?.availableQuantity).toBe(5);
    });

    it('ignores terminal holds and reservations, which are history', async () => {
      const stockId = await anchor(chain.skuId, 10);
      await hold(stockId, 4, 'CONVERTED');
      await hold(stockId, 4, 'RELEASED');
      await hold(stockId, 4, 'EXPIRED');
      await reservation(stockId, 4, 'CONSUMED');
      await reservation(stockId, 4, 'RELEASED');
      await reservation(stockId, 4, 'EXPIRED');

      // Six terminal rows totalling 24 against 10 on hand. If any of them
      // counted, this would be negative and the floor would hide it — so the
      // assertion is the full 10, not merely "not negative".
      expect((await projectedSkus()).get(chain.skuId)?.availableQuantity).toBe(10);
    });

    it('reports zero, not a negative, when everything on hand is committed', async () => {
      const stockId = await anchor(chain.skuId, 3);
      await reservation(stockId, 3, 'RESERVED');

      // The §27 B matrix. Zero is a normal read state: the SKU is still
      // projected, so the purchase panel can render OUT_OF_STOCK rather than
      // behaving as though the product had nothing to sell.
      const projected = await projectedSkus();
      expect(projected.get(chain.skuId)?.availableQuantity).toBe(0);
      expect(projected.has(chain.skuId)).toBe(true);
    });

    it('is not the manual display flag', async () => {
      const stockId = await anchor(chain.skuId, 7);
      await db().execute(
        sql`update products set is_display_out_of_stock = true where id = ${chain.productId}`,
      );

      // `BR-022`: the flag is presentation authority and never stock truth. A
      // read that consulted it would answer 0 here.
      expect((await projectedSkus()).get(chain.skuId)?.availableQuantity).toBe(7);
      expect(stockId).toBeDefined();
    });
  });

  describe('a missing stock anchor is unavailable, and stays missing', () => {
    it('projects the SKU as unavailable and writes no stock row', async () => {
      // The §27 C matrix. The chain seeds the SKU but no `sku_stocks` row.
      const before = {
        stocks: await countOf(sql`select count(*)::text as count from sku_stocks`),
        holds: await countOf(sql`select count(*)::text as count from inventory_soft_holds`),
        reservations: await countOf(
          sql`select count(*)::text as count from inventory_reservations`,
        ),
        ledger: await countOf(sql`select count(*)::text as count from inventory_ledger_entries`),
      };
      expect(before.stocks).toBe(0);

      const projected = await projectedSkus();
      await query.publicRead(chain.productSlug);

      expect(projected.get(chain.skuId)?.availableQuantity).toBe(0);
      expect({
        stocks: await countOf(sql`select count(*)::text as count from sku_stocks`),
        holds: await countOf(sql`select count(*)::text as count from inventory_soft_holds`),
        reservations: await countOf(
          sql`select count(*)::text as count from inventory_reservations`,
        ),
        ledger: await countOf(sql`select count(*)::text as count from inventory_ledger_entries`),
      }).toEqual(before);
    });

    it('creates no hold or reservation for an anchored SKU either', async () => {
      await anchor(chain.skuId, 5);

      await query.publicRead(chain.productSlug);
      await query.publicRead(chain.productSlug);

      // `BR-024`: the reservation belongs to durable order creation. Reading a
      // product page twice commits nothing, so the same customer sees the same
      // number and no stock has quietly left the pool.
      expect(await countOf(sql`select count(*)::text as count from inventory_soft_holds`)).toBe(0);
      expect(await countOf(sql`select count(*)::text as count from inventory_reservations`)).toBe(
        0,
      );
      expect(await countOf(sql`select count(*)::text as count from inventory_ledger_entries`)).toBe(
        0,
      );
    });
  });

  describe('eligibility and cardinality', () => {
    it('excludes an inactive SKU while keeping its variant', async () => {
      // The §27 D matrix. `is_active = false` delists a SKU; the row remains.
      await db().execute(sql`update skus set is_active = false where id = ${chain.skuId}`);
      await anchor(chain.skuId, 9);

      const view = await query.publicRead(chain.productSlug);

      expect(view.variants.map((variant) => variant.productVariantId)).toEqual([
        chain.productVariantId,
      ]);
      expect(view.variants[0]!.skus).toEqual([]);
      expect(await countOf(sql`select count(*)::text as count from skus`)).toBe(1);
    });

    it('projects every eligible SKU of a variant, choosing no winner', async () => {
      // The §27 E matrix. `product-sku.policy.ts` caps the eligible set at one
      // per variant on the *write* side; this read may not assume that cap, and
      // a heuristic winner would be exactly the resolution that policy forbids.
      const second = await addSku({ priceOverrideAmount: '199000' });
      const third = await addSku({ priceOverrideAmount: '299000' });
      await addSku({ priceOverrideAmount: '99000', isActive: false });
      await anchor(chain.skuId, 1);
      await anchor(second, 2);
      await anchor(third, 3);

      const view = await query.publicRead(chain.productSlug);
      const ids = view.variants[0]!.skus.map((sku) => sku.skuId);

      expect(ids).toHaveLength(3);
      expect(new Set(ids)).toEqual(new Set([chain.skuId, second, third]));
      // Ordered by id, which is total — two reads that changed nothing agree.
      expect(ids).toEqual([...ids].sort());
      expect(view.variants[0]!.skus.map((sku) => sku.availableQuantity).sort()).toEqual([1, 2, 3]);
    });
  });

  describe('price is BR-021, resolved on the server', () => {
    it('falls back to the product base price and prefers a SKU override', async () => {
      // The §27 F matrix. The chain's product base price is 150000; the override
      // is a different number, so a resolution that took the wrong operand
      // cannot produce a coincidentally correct answer.
      const overridden = await addSku({ priceOverrideAmount: '199000' });
      await anchor(chain.skuId, 1);
      await anchor(overridden, 1);

      const projected = await projectedSkus();

      expect(projected.get(chain.skuId)?.unitPrice).toEqual({
        amount: '150000',
        currency: 'VND',
      });
      expect(projected.get(overridden)?.unitPrice).toEqual({
        amount: '199000',
        currency: 'VND',
      });
    });

    it('publishes an override of zero as a price rather than as no override', async () => {
      const free = await addSku({ priceOverrideAmount: '0' });
      await anchor(free, 1);

      expect((await projectedSkus()).get(free)?.unitPrice.amount).toBe('0');
    });

    it('states money as a string, so no VND amount passes through a float', async () => {
      const large = await addSku({ priceOverrideAmount: '999999999999' });
      await anchor(large, 1);

      const price = (await projectedSkus()).get(large)?.unitPrice;
      // 999999999999 survives a double, but 999999999999.00 → '1000000000000'
      // is what a parse-and-format round trip produces at the next digit. The
      // assertion is that it is never parsed at all.
      expect(price).toEqual({ amount: '999999999999', currency: 'VND' });
      expect(typeof price?.amount).toBe('string');
    });
  });

  describe('the publication boundary is unchanged', () => {
    it('refuses an unpublished product even when its SKU is in stock', async () => {
      await anchor(chain.skuId, 25);
      await db().execute(
        sql`update products set status = 'ARCHIVED' where id = ${chain.productId}`,
      );

      await expect(query.publicRead(chain.productSlug)).rejects.toThrow();
    });

    it('publishes no warehouse internal beside the number', async () => {
      const stockId = await anchor(chain.skuId, 10);
      await hold(stockId, 2, 'HELD');
      await reservation(stockId, 3, 'RESERVED');

      const view = await query.publicRead(chain.productSlug);
      const serialized = JSON.stringify(view);

      // The anchor id, the order the reservation is for and the request the hold
      // is for are all one join away and none of them is published.
      expect(serialized).not.toContain(stockId);
      expect(serialized).not.toContain(chain.orderId);
      expect(serialized).not.toContain(chain.customRequestId);
      // Nor is the arithmetic: 10 on hand and the 2/3 breakdown appear nowhere —
      // the SKU carries exactly three keys and the balance is one of them.
      expect(view.variants[0]!.skus[0]).toEqual({
        skuId: chain.skuId,
        unitPrice: { amount: '150000', currency: 'VND' },
        availableQuantity: 5,
      });
    });
  });
});
