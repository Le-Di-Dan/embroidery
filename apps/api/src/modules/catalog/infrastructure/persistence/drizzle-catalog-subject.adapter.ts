/**
 * Catalog subject labels against the catalog tables (`APP5-B03` §6, §10).
 *
 * One inner join, one row, four columns. The join is what enforces the port's
 * conjunctive rule — a variant of another product simply produces no row, so
 * there is no second query whose result a later edit could forget to check.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, eq, inArray } from 'drizzle-orm';

import type {
  CatalogProductLabels,
  CatalogSubjectLabels,
  CatalogSubjectPort,
  CatalogSubjectReference,
} from '../../domain/repositories/catalog-subject.port';
import type { ProductId } from '../../domain/repositories/placement-hierarchy.port';

const { products, productVariants } = schema;

@Injectable()
export class DrizzleCatalogSubjectAdapter extends DrizzleRepository implements CatalogSubjectPort {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findSubjectLabels(
    reference: CatalogSubjectReference,
  ): Promise<CatalogSubjectLabels | undefined> {
    return this.run('findSubjectLabels', async () => {
      const [row] = await this.db
        .select({
          productName: products.name,
          productSlug: products.slug,
          variantColorName: productVariants.colorName,
          variantSizeLabel: productVariants.sizeLabel,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(productVariants.id, reference.productVariantId),
            eq(productVariants.productId, reference.productId),
          ),
        )
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        productName: row.productName,
        productSlug: row.productSlug,
        variantColorName: row.variantColorName ?? undefined,
        variantSizeLabel: row.variantSizeLabel ?? undefined,
      };
    });
  }

  /**
   * One `IN` statement for a whole page, and an empty input short-circuits.
   *
   * `inArray` with an empty list compiles to a predicate Drizzle refuses, and
   * asking the database whether anything matches nothing is a round trip with a
   * known answer either way.
   */
  async findProductLabels(
    productIds: readonly ProductId[],
  ): Promise<ReadonlyMap<ProductId, CatalogProductLabels>> {
    if (productIds.length === 0) {
      return new Map();
    }
    return this.run('findProductLabels', async () => {
      const rows = await this.db
        .select({ id: products.id, name: products.name, slug: products.slug })
        .from(products)
        .where(inArray(products.id, [...new Set(productIds)]));

      return new Map(
        rows.map((row) => [row.id as ProductId, { productName: row.name, productSlug: row.slug }]),
      );
    });
  }
}
