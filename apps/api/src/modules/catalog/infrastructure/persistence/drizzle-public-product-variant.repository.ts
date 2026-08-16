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
 * The repository opens no transaction (DEC-DB7-006): these are ordinary reads,
 * and each is already a single consistent snapshot.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, asc, eq, isNull } from 'drizzle-orm';

import type {
  ProductId,
  ProductVariantId,
} from '../../domain/repositories/placement-hierarchy.port';
import type {
  PublicProductVariantRepository,
  PublicProductVariantRow,
  PublicProductVariants,
} from '../../domain/repositories/public-product-variant.repository';
import {
  APP2_CATEGORY_STATUS,
  PUBLIC_PRODUCT_VISIBLE_STATE,
} from '../../domain/public-product-catalog.policy';

const { products, categories, productVariants } = schema;

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
        .select({ id: products.id })
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

      return {
        productId: product.id as ProductId,
        variants: rows.map(toVariantRow),
      };
    });
  }
}

/**
 * Row → domain. Both attribute columns are nullable in the schema and
 * `undefined` in the domain, so the projection above them never has to decide
 * what a SQL `NULL` means.
 */
function toVariantRow(row: {
  id: string;
  colorName: string | null;
  sizeLabel: string | null;
}): PublicProductVariantRow {
  return {
    id: row.id as ProductVariantId,
    colorName: row.colorName ?? undefined,
    sizeLabel: row.sizeLabel ?? undefined,
  };
}
