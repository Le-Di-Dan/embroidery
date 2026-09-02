/**
 * Drizzle implementation of the public variant selection read (`APP5-B07`).
 *
 * ## Visibility is in the SQL, not above it
 *
 * `status = 'PUBLISHED'`, the public-category join and `archived_at IS NULL` are
 * part of the product statement itself — the same three predicates
 * `drizzle-public-product.repository.ts` and `drizzle-product-placement.repository.ts`
 * already apply. A draft product's variants never arrive for a service to filter
 * out later, so there is no code path on which forgetting a check leaks one.
 *
 * ## Two statements, not a join
 *
 * The product is resolved first, then its variants by `product_id`. A single
 * joined statement would return zero rows for a published product with no active
 * variant, making "not public" and "public but unselectable" indistinguishable —
 * and those are precisely the two cases `APP5-S01` has to render differently.
 * Two statements is a constant, not a per-item cost: this is one product.
 *
 * ## Eligibility is `is_active`
 *
 * `product_variants` carries no lifecycle of its own. TBL-013 records that
 * `is_active` "delists a variant without archiving it", and that is the whole
 * authority — no publication state, no archive column and no new lifecycle is
 * invented here. A delisted variant is absent, which is what makes the list
 * *selectable* rather than merely descriptive.
 *
 * ## `APP12-B01` — a third statement for the order-eligible SKUs
 *
 * One more statement, not one per variant: the SKUs of every returned variant
 * are loaded with a single `in (…)` over `ix_skus__variant` (IDX-069). The cost
 * stays constant in the number of variants, so nothing here grows into an N+1.
 *
 * `is_active` is the eligibility predicate on this table too, and it is in the
 * SQL for the same reason it is for variants: an inactive SKU never arrives, so
 * no projection above can publish one as purchasable. The value comes from
 * `SKU_ORDER_ELIGIBLE_IS_ACTIVE` — the constant `APP7-B01` already writes the
 * Admin invariant in terms of — rather than a bare `true`, so "order-eligible"
 * means one thing on the write side and the read side.
 *
 * The statement selects the price columns and **nothing else**: no `code`, no
 * `is_active`, no timestamps. It joins no inventory table at all — `sku_stocks`
 * and its children are CTX-INV (REL-026) and reach the projection through
 * `SKU_AVAILABILITY_SNAPSHOT_PORT` instead. `products.is_display_out_of_stock`
 * is not selected either: `BR-022` makes it presentation authority, never stock
 * truth.
 *
 * The repository opens no transaction (DEC-DB7-006): these are ordinary reads,
 * and each is already a single consistent snapshot. It also writes nothing —
 * there is no `ensureStockRow`, no insert and no update on any path, so a SKU
 * with no stock anchor stays without one however often the page is read.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type {
  ProductId,
  ProductVariantId,
  SkuId,
} from '../../domain/repositories/placement-hierarchy.port';
import type {
  PublicProductSkuRow,
  PublicProductVariantRepository,
  PublicProductVariantRow,
  PublicProductVariants,
} from '../../domain/repositories/public-product-variant.repository';
import {
  APP2_CATEGORY_STATUS,
  PUBLIC_PRODUCT_VISIBLE_STATE,
} from '../../domain/public-product-catalog.policy';
import { SKU_ORDER_ELIGIBLE_IS_ACTIVE } from '../../domain/product-sku.policy';

const { products, categories, productVariants, skus } = schema;

@Injectable()
export class DrizzlePublicProductVariantRepository
  extends DrizzleRepository
  implements PublicProductVariantRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findPublicVariants(slug: string): Promise<PublicProductVariants | undefined> {
    return this.run('findPublicVariants', async () => {
      const [product] = await this.db
        .select({
          id: products.id,
          // APP12-B01: BR-021's fallback operand and the currency it is
          // denominated in, read from the product row rather than assumed.
          basePriceAmount: products.basePriceAmount,
          currencyCode: products.currencyCode,
        })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            eq(products.slug, slug),
            eq(products.status, PUBLIC_PRODUCT_VISIBLE_STATE),
            eq(categories.status, APP2_CATEGORY_STATUS),
            isNull(categories.archivedAt),
          ),
        )
        .limit(1);

      if (product === undefined) {
        return undefined;
      }

      const rows = await this.db
        .select({
          id: productVariants.id,
          colorName: productVariants.colorName,
          sizeLabel: productVariants.sizeLabel,
        })
        .from(productVariants)
        .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)))
        // IDX-068's own key order, then `id` as the tie-breaker that makes it
        // total. `display_order` is not unique, so ordering by it alone would let
        // PostgreSQL return two equally-ordered variants in either sequence — and
        // a selector that reshuffles between reads is a selector a customer can
        // click wrong.
        .orderBy(asc(productVariants.displayOrder), asc(productVariants.id));

      const skusByVariant = await this.findOrderEligibleSkus(rows.map((row) => row.id));

      return {
        productId: product.id as ProductId,
        basePriceAmount: product.basePriceAmount,
        currencyCode: product.currencyCode,
        variants: rows.map((row) => toVariantRow(row, skusByVariant.get(row.id) ?? [])),
      };
    });
  }

  /**
   * The order-eligible SKUs of the given variants, grouped by variant.
   *
   * Ordered by id — total by construction, because `skus` carries no display
   * order of its own. Deterministic output is what makes two reads that changed
   * nothing agree, and it is not a ranking: nothing downstream treats the first
   * entry as "the" SKU (`product-sku.policy.ts`).
   */
  private async findOrderEligibleSkus(
    variantIds: readonly string[],
  ): Promise<Map<string, PublicProductSkuRow[]>> {
    const grouped = new Map<string, PublicProductSkuRow[]>();
    if (variantIds.length === 0) {
      return grouped;
    }

    const rows = await this.db
      .select({
        id: skus.id,
        productVariantId: skus.productVariantId,
        priceOverrideAmount: skus.priceOverrideAmount,
        currencyCode: skus.currencyCode,
      })
      .from(skus)
      .where(
        and(
          inArray(skus.productVariantId, [...variantIds]),
          eq(skus.isActive, SKU_ORDER_ELIGIBLE_IS_ACTIVE),
        ),
      )
      .orderBy(asc(skus.id));

    for (const row of rows) {
      const bucket = grouped.get(row.productVariantId) ?? [];
      bucket.push({
        id: row.id as SkuId,
        priceOverrideAmount: row.priceOverrideAmount ?? undefined,
        currencyCode: row.currencyCode,
      });
      grouped.set(row.productVariantId, bucket);
    }

    return grouped;
  }
}

/**
 * Row → domain. Both attribute columns are nullable in the schema and
 * `undefined` in the domain, so the projection above them never has to decide
 * what a SQL `NULL` means.
 */
function toVariantRow(
  row: {
    id: string;
    colorName: string | null;
    sizeLabel: string | null;
  },
  skuRows: readonly PublicProductSkuRow[],
): PublicProductVariantRow {
  return {
    id: row.id as ProductVariantId,
    colorName: row.colorName ?? undefined,
    sizeLabel: row.sizeLabel ?? undefined,
    skus: skuRows,
  };
}
