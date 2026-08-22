/**
 * Drizzle implementation of the Admin SKU-authoring contract (`APP7-B01`).
 *
 * Opens no transaction of its own (DEC-DB7-006) — the use case owns that
 * through `TransactionManager` — and takes every lock inside it.
 *
 * The locking read is two statements rather than one join with two locking
 * clauses: a Drizzle select carries a **single** `for(...)` clause, so chaining
 * `.for('update')` and `.for('share')` would silently keep only the last one and
 * the variant would never be write-locked. That is the exact defect
 * `APP2-B03`'s `lockSnapshot` documents, and it is not repeated here.
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
import type {
  CreateSkuInput,
  ProductSkuRepository,
  SkuRecord,
  UpdateSkuFields,
  VariantLockResult,
} from '../../domain/repositories/product-sku.repository';
import { SKU_CURRENCY } from '../../domain/product-sku.policy';

const { products, productVariants, skus } = schema;

interface SkuRow {
  readonly id: string;
  readonly productVariantId: string;
  readonly code: string;
  readonly priceOverrideAmount: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toRecord(row: SkuRow): SkuRecord {
  return {
    id: row.id as SkuId,
    productVariantId: row.productVariantId as ProductVariantId,
    code: row.code,
    priceOverrideAmount: row.priceOverrideAmount ?? undefined,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class DrizzleProductSkuRepository extends DrizzleRepository implements ProductSkuRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async lockVariantForWrite(
    productId: ProductId,
    variantId: ProductVariantId,
  ): Promise<VariantLockResult> {
    return this.run('lockVariantForWrite', async () => {
      const tx = this.requireTransaction('lockVariantForWrite');

      // The variant first and exclusively. Taking this lock before anything
      // else is read is what makes two concurrent SKU writes against the same
      // variant serialise instead of both seeing the same pre-mutation set.
      const [variant] = await tx
        .select({ id: productVariants.id, productId: productVariants.productId })
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .limit(1)
        .for('update');

      if (variant === undefined) {
        // No such variant, or no such product: told apart with one plain read,
        // because an operator who mistyped the product needs a different answer
        // from one who mistyped the variant.
        const exists = await this.productExists(productId);
        return { ok: false, reason: exists ? 'VARIANT_NOT_FOUND' : 'PRODUCT_NOT_FOUND' };
      }
      if (variant.productId !== productId) {
        return { ok: false, reason: 'PRODUCT_MISMATCH' };
      }

      return this.withProduct(variant.productId as ProductId, variant.id as ProductVariantId);
    });
  }

  async lockVariantOfSku(skuId: SkuId): Promise<VariantLockResult | undefined> {
    return this.run('lockVariantOfSku', async () => {
      const tx = this.requireTransaction('lockVariantOfSku');

      // Which variant owns this SKU is read without a lock and is not trusted
      // as the decision: it only says which row to lock. The caller re-reads the
      // SKU under that lock, and ownership is immutable in this checkpoint, so
      // the row that gets locked is the row that still owns the SKU at commit.
      const [owner] = await tx
        .select({ productVariantId: skus.productVariantId })
        .from(skus)
        .where(eq(skus.id, skuId))
        .limit(1);

      if (owner === undefined) return undefined;

      const [variant] = await tx
        .select({ id: productVariants.id, productId: productVariants.productId })
        .from(productVariants)
        .where(eq(productVariants.id, owner.productVariantId))
        .limit(1)
        .for('update');

      if (variant === undefined) {
        // Unreachable through `fk_skus__product_variant_id`, which is
        // `on delete restrict`; kept as a refusal rather than a crash.
        return { ok: false, reason: 'VARIANT_NOT_FOUND' };
      }

      return this.withProduct(variant.productId as ProductId, variant.id as ProductVariantId);
    });
  }

  async listByVariant(variantId: ProductVariantId): Promise<readonly SkuRecord[]> {
    return this.run('listByVariant', async () => {
      const tx = this.requireTransaction('listByVariant');
      const rows = await tx
        .select()
        .from(skus)
        .where(eq(skus.productVariantId, variantId))
        .orderBy(asc(skus.createdAt), asc(skus.id));
      return rows.map(toRecord);
    });
  }

  async findById(id: SkuId): Promise<SkuRecord | undefined> {
    return this.run('findById', async () => {
      const tx = this.requireTransaction('findById');
      const [row] = await tx.select().from(skus).where(eq(skus.id, id)).limit(1);
      return row === undefined ? undefined : toRecord(row);
    });
  }

  async insert(input: CreateSkuInput): Promise<SkuRecord> {
    return this.run('insert', async () => {
      const tx = this.requireTransaction('insert');
      const [row] = await tx
        .insert(skus)
        .values({
          id: input.id,
          productVariantId: input.productVariantId,
          code: input.code,
          priceOverrideAmount: input.priceOverrideAmount ?? null,
          currencyCode: SKU_CURRENCY,
          isActive: input.isActive,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'ProductSkuRepository.insert',
          'CATALOG_WRITE_FAILED',
          'Could not create the SKU.',
        );
      }
      return toRecord(row);
    });
  }

  async update(id: SkuId, fields: UpdateSkuFields): Promise<SkuRecord | undefined> {
    return this.run('update', async () => {
      const tx = this.requireTransaction('update');
      const [row] = await tx
        .update(skus)
        .set({
          ...(fields.code === undefined ? {} : { code: fields.code }),
          ...(fields.priceOverrideAmount === undefined
            ? {}
            : { priceOverrideAmount: fields.priceOverrideAmount }),
          ...(fields.isActive === undefined ? {} : { isActive: fields.isActive }),
          // Always advanced, and by the database clock rather than the API
          // host's: a skewed host must not be able to stamp a row backwards.
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(skus.id, id))
        .returning();

      return row === undefined ? undefined : toRecord(row);
    });
  }

  /** Locks the owning product `FOR SHARE` and returns the write context. */
  private async withProduct(
    productId: ProductId,
    variantId: ProductVariantId,
  ): Promise<VariantLockResult> {
    const tx = this.requireTransaction('withProduct');

    // Share mode, not exclusive: this transaction only needs the product's
    // lifecycle state to stay as it is until commit. An exclusive lock would
    // serialise SKU writes across every variant of the same product.
    const [product] = await tx
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1)
      .for('share');

    if (product === undefined) {
      return { ok: false, reason: 'PRODUCT_NOT_FOUND' };
    }
    return {
      ok: true,
      context: { productId: product.id as ProductId, productStatus: product.status, variantId },
    };
  }

  private async productExists(productId: ProductId): Promise<boolean> {
    const [row] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    return row !== undefined;
  }
}
