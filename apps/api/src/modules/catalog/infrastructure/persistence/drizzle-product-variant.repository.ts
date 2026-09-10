/**
 * Drizzle implementation of the Admin variant-authoring contract
 * (`APP12-N02.B01`).
 *
 * Opens no transaction of its own (DEC-DB7-006) — the use case owns that
 * through `TransactionManager` — and takes its one lock inside it.
 *
 * The Admin authoring read is three statements regardless of how many variants
 * or SKUs a Product has: the Product's state, the variant set, and every SKU
 * under it in one join. Never one read per variant.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { guardViolationError, schema } from '@embroidery/database';
import { asc, eq, sql } from 'drizzle-orm';

import type {
  ProductId,
  ProductVariantId,
  SkuId,
} from '../../domain/repositories/placement-hierarchy.port';
import type { SkuRecord } from '../../domain/repositories/product-sku.repository';
import type {
  CreateProductVariantInput,
  ProductVariantRecord,
  ProductVariantRepository,
  UpdateProductVariantFields,
  VariantWriteContext,
} from '../../domain/repositories/product-variant.repository';

const { products, productVariants, skus } = schema;

interface VariantRow {
  readonly id: string;
  readonly productId: string;
  readonly colorName: string | null;
  readonly sizeLabel: string | null;
  readonly displayOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toRecord(row: VariantRow): ProductVariantRecord {
  return {
    id: row.id as ProductVariantId,
    productId: row.productId as ProductId,
    colorName: row.colorName ?? undefined,
    sizeLabel: row.sizeLabel ?? undefined,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class DrizzleProductVariantRepository
  extends DrizzleRepository
  implements ProductVariantRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findProductStatus(productId: ProductId): Promise<string | undefined> {
    return this.run('findProductStatus', async () => {
      const [row] = await this.db
        .select({ status: products.status })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      return row?.status;
    });
  }

  async listByProduct(productId: ProductId): Promise<readonly ProductVariantRecord[]> {
    return this.run('listByProduct', async () => this.selectVariants(productId));
  }

  async listByProductForUpdate(productId: ProductId): Promise<readonly ProductVariantRecord[]> {
    return this.run('listByProductForUpdate', async () => {
      // Asserted rather than passed: this read is only correct while the
      // caller's transaction holds the Product lock, and a caller that had lost
      // it would otherwise settle the duplicate rule against an unprotected
      // read. `this.db` resolves to that same transaction.
      this.requireTransaction('listByProductForUpdate');
      return this.selectVariants(productId);
    });
  }

  async listSkusByProduct(productId: ProductId): Promise<readonly SkuRecord[]> {
    return this.run('listSkusByProduct', async () => {
      // One join rather than a read per variant: the whole SKU set of a
      // Product, inactive rows included, in a single round trip.
      const rows = await this.db
        .select({
          id: skus.id,
          productVariantId: skus.productVariantId,
          code: skus.code,
          priceOverrideAmount: skus.priceOverrideAmount,
          isActive: skus.isActive,
          createdAt: skus.createdAt,
          updatedAt: skus.updatedAt,
        })
        .from(skus)
        .innerJoin(productVariants, eq(productVariants.id, skus.productVariantId))
        .where(eq(productVariants.productId, productId))
        .orderBy(asc(skus.createdAt), asc(skus.id));

      return rows.map((row) => ({
        id: row.id as SkuId,
        productVariantId: row.productVariantId as ProductVariantId,
        code: row.code,
        priceOverrideAmount: row.priceOverrideAmount ?? undefined,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    });
  }

  async lockProductForWrite(productId: ProductId): Promise<VariantWriteContext | undefined> {
    return this.run('lockProductForWrite', async () => {
      const tx = this.requireTransaction('lockProductForWrite');

      // Exclusive, and taken before the variant set is read. This is what makes
      // two concurrent creates serialise instead of both computing the same
      // `display_order` from a set neither one is in yet.
      const [row] = await tx
        .select({ id: products.id, status: products.status })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1)
        .for('update');

      return row === undefined
        ? undefined
        : { productId: row.id as ProductId, productStatus: row.status };
    });
  }

  async findOwningProduct(variantId: ProductVariantId): Promise<ProductId | undefined> {
    return this.run('findOwningProduct', async () => {
      const [row] = await this.db
        .select({ productId: productVariants.productId })
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .limit(1);
      return row === undefined ? undefined : (row.productId as ProductId);
    });
  }

  async insert(input: CreateProductVariantInput): Promise<ProductVariantRecord> {
    return this.run('insert', async () => {
      const tx = this.requireTransaction('insert');
      const [row] = await tx
        .insert(productVariants)
        .values({
          id: input.id,
          productId: input.productId,
          colorName: input.colorName ?? null,
          sizeLabel: input.sizeLabel ?? null,
          displayOrder: input.displayOrder,
          isActive: input.isActive,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'ProductVariantRepository.insert',
          'CATALOG_WRITE_FAILED',
          'Could not create the product variant.',
        );
      }
      return toRecord(row);
    });
  }

  async update(
    id: ProductVariantId,
    fields: UpdateProductVariantFields,
  ): Promise<ProductVariantRecord | undefined> {
    return this.run('update', async () => {
      const tx = this.requireTransaction('update');
      const [row] = await tx
        .update(productVariants)
        .set({
          ...(fields.colorName === undefined ? {} : { colorName: fields.colorName }),
          ...(fields.sizeLabel === undefined ? {} : { sizeLabel: fields.sizeLabel }),
          ...(fields.isActive === undefined ? {} : { isActive: fields.isActive }),
          // Always advanced, and by the database clock rather than the API
          // host's: a skewed host must not be able to stamp a row backwards.
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(productVariants.id, id))
        .returning();

      return row === undefined ? undefined : toRecord(row);
    });
  }

  /**
   * The Product's variant set in the published order.
   *
   * `display_order` is the operator-facing order and `created_at` breaks a tie
   * the server assigned; `id` is the final tie-break, so the sequence is total
   * and a list read twice cannot come back in two different orders.
   */
  private async selectVariants(productId: ProductId): Promise<ProductVariantRecord[]> {
    const rows = await this.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(
        asc(productVariants.displayOrder),
        asc(productVariants.createdAt),
        asc(productVariants.id),
      );
    return rows.map(toRecord);
  }
}
