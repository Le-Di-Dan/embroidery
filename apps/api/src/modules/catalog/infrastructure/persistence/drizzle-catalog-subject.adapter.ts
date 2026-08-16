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
import { and, eq } from 'drizzle-orm';

import type {
  CatalogSubjectLabels,
  CatalogSubjectPort,
  CatalogSubjectReference,
} from '../../domain/repositories/catalog-subject.port';

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
}
