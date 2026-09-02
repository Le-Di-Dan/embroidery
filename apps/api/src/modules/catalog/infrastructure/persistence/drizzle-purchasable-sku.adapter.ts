/**
 * Drizzle implementation of the purchasable-SKU read (`APP12-B02`).
 *
 * One statement, three joins, and exactly the eligibility predicates
 * `drizzle-public-product-variant.repository.ts` applies — product
 * `PUBLISHED`, category `PUBLISHED` and un-archived, variant `is_active`, SKU
 * `is_active` — from the same constants, so "publicly sellable" means one thing
 * on the read path and the write path. `products.archived_at` is not tested
 * separately for the same reason it is not there: an archived product holds the
 * `ARCHIVED` status, which the `PUBLISHED` predicate already excludes.
 *
 * ## Why one joined statement here, and two there
 *
 * The variant repository splits its reads deliberately: a joined statement
 * would make *"this product is not public"* and *"this product is public but
 * has no active variant"* indistinguishable, and `APP5-S01` renders those
 * differently. Order creation has no such distinction to preserve. Every reason
 * a SKU is not sellable collapses to one refusal by design
 * (`purchasable-sku.port.ts`), so one statement that returns a row or nothing
 * is the honest shape — and it is what makes the whole eligibility decision a
 * single consistent read inside the caller's transaction rather than four reads
 * that could each be true of a different instant.
 *
 * ## No lock
 *
 * The row is read without `FOR UPDATE`. Locking the Catalog rows would not make
 * the price safer: a Catalog edit that commits a microsecond after this read is
 * indistinguishable from one that commits a microsecond before the request
 * arrived, and no lock closes that. What the transaction actually guarantees is
 * that the price frozen onto the line is a price that **was** the published one
 * at an instant inside the committing transaction, read after the customer's
 * intent and before the row was written — which is the guarantee `BR-021`
 * states. Taking `FOR UPDATE` on `products` from a public checkout would also
 * put an anonymous request in front of every Admin Catalog write for the
 * duration of a stock decision, which is a denial-of-service surface bought for
 * no correctness.
 *
 * The **stock** decision is the one that genuinely needs serialising, and it is
 * serialised, on the `sku_stocks` anchor, by the Inventory writer (GRD-014).
 *
 * ## No inventory join
 *
 * `sku_stocks` and its children are CTX-INV (REL-026) and this adapter does not
 * touch them. It also writes nothing — no `ensureStockRow`, no insert, no
 * update — so reading a SKU during checkout never provisions a stock anchor.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, eq, isNull } from 'drizzle-orm';

import type {
  ProductId,
  ProductVariantId,
  SkuId,
} from '../../domain/repositories/placement-hierarchy.port';
import type {
  PurchasableSku,
  PurchasableSkuPort,
} from '../../domain/repositories/purchasable-sku.port';
import {
  APP2_CATEGORY_STATUS,
  PUBLIC_PRODUCT_VISIBLE_STATE,
} from '../../domain/public-product-catalog.policy';
import { SKU_ORDER_ELIGIBLE_IS_ACTIVE } from '../../domain/product-sku.policy';

const { products, categories, productVariants, skus } = schema;

@Injectable()
export class DrizzlePurchasableSkuAdapter extends DrizzleRepository implements PurchasableSkuPort {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findPurchasable(skuId: string): Promise<PurchasableSku | undefined> {
    return this.run('findPurchasable', async () => {
      const [row] = await this.db
        .select({
          skuId: skus.id,
          productId: products.id,
          productVariantId: productVariants.id,
          productName: products.name,
          variantLabel: productVariants.colorName,
          sizeLabel: productVariants.sizeLabel,
          priceOverrideAmount: skus.priceOverrideAmount,
          skuCurrencyCode: skus.currencyCode,
          basePriceAmount: products.basePriceAmount,
          productCurrencyCode: products.currencyCode,
        })
        .from(skus)
        .innerJoin(productVariants, eq(productVariants.id, skus.productVariantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            eq(skus.id, skuId),
            eq(skus.isActive, SKU_ORDER_ELIGIBLE_IS_ACTIVE),
            // TBL-013: `is_active` delists a variant without archiving it, and
            // that is the whole variant eligibility authority — the same bare
            // predicate `drizzle-public-product-variant.repository.ts` applies.
            eq(productVariants.isActive, true),
            eq(products.status, PUBLIC_PRODUCT_VISIBLE_STATE),
            eq(categories.status, APP2_CATEGORY_STATUS),
            isNull(categories.archivedAt),
          ),
        )
        .limit(1);

      if (row === undefined) {
        return undefined;
      }

      return {
        skuId: row.skuId as SkuId,
        productId: row.productId as ProductId,
        productVariantId: row.productVariantId as ProductVariantId,
        productName: row.productName,
        variantLabel: row.variantLabel ?? undefined,
        sizeLabel: row.sizeLabel ?? undefined,
        priceOverrideAmount: row.priceOverrideAmount ?? undefined,
        skuCurrencyCode: row.skuCurrencyCode,
        basePriceAmount: row.basePriceAmount,
        productCurrencyCode: row.productCurrencyCode,
      };
    });
  }
}
