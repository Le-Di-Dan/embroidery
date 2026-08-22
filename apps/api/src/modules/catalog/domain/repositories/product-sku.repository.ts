/**
 * Admin SKU-authoring persistence contract (`APP7-B01`, TBL-013/TBL-014).
 *
 * A fourth narrow Catalog port beside `ProductRepository` (DB7 structure),
 * `ProductDraftRepository` (B02) and `ProductPublicationRepository` (B03), for
 * the reason those three are already separate: the facts a SKU write depends on
 * — the owning variant, its product's state, and the variant's whole SKU set —
 * must be read **under a lock, inside the caller's transaction**. Widening
 * `ProductRepository` with locking reads would hand every existing consumer a
 * surface it must not use casually, and `ProductRepository.addSku` stays exactly
 * as the DB7 structure builder left it.
 *
 * The rule that shapes the whole contract: **`product_variants` is the
 * concurrency arbiter.** `skus.product_variant_id` carries no uniqueness
 * constraint (`CST-012` is on `code` alone), so nothing in the database
 * prevents two concurrent Admin writes from each adding a sellable SKU to the
 * same variant. The owning variant row is the one object both transactions must
 * touch, so locking it `FOR UPDATE` before reading the SKU set is what makes the
 * check-then-write atomic. There is no application mutex and no in-memory lock:
 * this API has more than one process.
 *
 * `APP7-B01` adds no column, no constraint and no migration.
 */
import type { ProductId, ProductVariantId, SkuId } from './placement-hierarchy.port';

/** The owning chain of one SKU write, read under the variant lock. */
export interface SkuWriteContext {
  readonly productId: ProductId;
  readonly productStatus: string;
  readonly variantId: ProductVariantId;
}

/** One SKU row as this feature reads it. Never the currency — it is fixed. */
export interface SkuRecord {
  readonly id: SkuId;
  readonly productVariantId: ProductVariantId;
  readonly code: string;
  readonly priceOverrideAmount: string | undefined;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Why a locked variant lookup found nothing. */
export type VariantLockMiss = 'PRODUCT_NOT_FOUND' | 'VARIANT_NOT_FOUND' | 'PRODUCT_MISMATCH';

export type VariantLockResult =
  | { readonly ok: true; readonly context: SkuWriteContext }
  | { readonly ok: false; readonly reason: VariantLockMiss };

export interface CreateSkuInput {
  readonly id: SkuId;
  readonly productVariantId: ProductVariantId;
  readonly code: string;
  readonly priceOverrideAmount: string | undefined;
  readonly isActive: boolean;
}

/**
 * The patch, already reduced to the fields the request actually named.
 *
 * `priceOverrideAmount: null` clears the override to NULL; an absent key leaves
 * the stored value alone. `productVariantId` is deliberately absent: SKU
 * ownership is immutable in this checkpoint, so there is no shape in which a
 * body can rebind a SKU to another variant.
 */
export interface UpdateSkuFields {
  readonly code?: string;
  readonly priceOverrideAmount?: string | null;
  readonly isActive?: boolean;
}

export const PRODUCT_SKU_REPOSITORY = Symbol('PRODUCT_SKU_REPOSITORY');

export interface ProductSkuRepository {
  /**
   * Locks the owning variant `FOR UPDATE` and proves the product/variant
   * hierarchy from the locked rows.
   *
   * The product is locked `FOR SHARE`: this transaction does not write it, but
   * its lifecycle state gates the decision and must not change before commit.
   * Both facts come from the database in this transaction — never from the
   * request, which names the pair but proves nothing about it.
   *
   * @requiresTransaction
   */
  lockVariantForWrite(
    productId: ProductId,
    variantId: ProductVariantId,
  ): Promise<VariantLockResult>;

  /**
   * The same lock, reached from a SKU instead of a URL.
   *
   * The owning variant is resolved **server-side** from the SKU row, then
   * locked, and the caller re-reads the SKU set under that lock. Returns
   * `undefined` when no such SKU exists.
   *
   * @requiresTransaction
   */
  lockVariantOfSku(skuId: SkuId): Promise<VariantLockResult | undefined>;

  /**
   * Every SKU of one variant, read inside the transaction that holds its lock.
   *
   * One statement for the whole set, never one per SKU: the order-eligible
   * count is a property of the set and is recomputed from this read after the
   * mutation, so a partial view would decide the invariant on partial evidence.
   *
   * @requiresTransaction
   */
  listByVariant(variantId: ProductVariantId): Promise<readonly SkuRecord[]>;

  /** @requiresTransaction */
  findById(id: SkuId): Promise<SkuRecord | undefined>;

  /** @requiresTransaction */
  insert(input: CreateSkuInput): Promise<SkuRecord>;

  /**
   * Writes only the named fields, and always advances `updated_at`.
   *
   * @requiresTransaction
   */
  update(id: SkuId, fields: UpdateSkuFields): Promise<SkuRecord | undefined>;
}
