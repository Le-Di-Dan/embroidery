/**
 * Admin variant-authoring persistence contract (`APP12-N02.B01`, TBL-013).
 *
 * A fifth narrow Catalog port beside `ProductRepository`, `ProductDraftRepository`,
 * `ProductPublicationRepository` and `ProductSkuRepository`, for the reason
 * those four are already separate: the facts a variant write depends on — the
 * owning Product's lifecycle state and its **whole** variant set — must be read
 * under a lock, inside the caller's transaction.
 *
 * ## The Product row is the concurrency arbiter
 *
 * `product_variants` carries no unique constraint on `(product_id, color_name,
 * size_label)` and `display_order` is `NOT NULL` with no `DEFAULT` (`N02.G01`),
 * so two concurrent creates would otherwise each read the same maximum order
 * and each see a set without the other's row. The one object both transactions
 * must touch is the owning **Product**, so locking that row `FOR UPDATE` before
 * the variant set is read is what makes check-then-write atomic. There is no
 * application mutex and no in-memory lock: this API has more than one process.
 *
 * That choice also fixes a lock order for the whole authoring surface. The
 * `APP7-B01` SKU writer takes `product_variants FOR UPDATE` and then `products
 * FOR SHARE`; this writer takes `products FOR UPDATE` and stops there, so it
 * never waits on a variant lock and no cycle between the two is representable.
 *
 * `APP12-N02.B01` adds no column, no constraint and no migration.
 */
import type { ProductId, ProductVariantId } from './placement-hierarchy.port';
import type { SkuRecord } from './product-sku.repository';

/** One `product_variants` row as this feature reads it. */
export interface ProductVariantRecord {
  readonly id: ProductVariantId;
  readonly productId: ProductId;
  readonly colorName: string | undefined;
  readonly sizeLabel: string | undefined;
  readonly displayOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** The owning Product of a variant write, read under its own lock. */
export interface VariantWriteContext {
  readonly productId: ProductId;
  readonly productStatus: string;
}

export interface CreateProductVariantInput {
  readonly id: ProductVariantId;
  readonly productId: ProductId;
  readonly colorName: string | undefined;
  readonly sizeLabel: string | undefined;
  /** Server-assigned under the Product lock. No request may carry this. */
  readonly displayOrder: number;
  readonly isActive: boolean;
}

/**
 * The patch, already reduced to the fields the request actually named.
 *
 * `colorName: null` clears the label; an absent key leaves the stored value
 * alone. `productId` and `displayOrder` are deliberately absent: a variant is
 * never moved between Products, and ordering is creation order (`N02.D01` §E),
 * so there is no shape in which a body can restate either.
 */
export interface UpdateProductVariantFields {
  readonly colorName?: string | null;
  readonly sizeLabel?: string | null;
  readonly isActive?: boolean;
}

export const PRODUCT_VARIANT_REPOSITORY = Symbol('PRODUCT_VARIANT_REPOSITORY');

export interface ProductVariantRepository {
  /**
   * The owning Product's lifecycle state, or `undefined` when there is no such
   * row. Unlocked: the read path only needs to answer whether to 404.
   */
  findProductStatus(productId: ProductId): Promise<string | undefined>;

  /**
   * Every variant of one Product — **active and inactive** — in the stable
   * order the Admin list publishes.
   *
   * The Admin authoring read is the history surface (`N02.D01` §S), so nothing
   * is filtered here. Filtering belongs to the public projection, which is a
   * different operation answering a different question.
   */
  listByProduct(productId: ProductId): Promise<readonly ProductVariantRecord[]>;

  /**
   * Every SKU under every variant of one Product, active and inactive, in one
   * statement.
   *
   * Batched rather than one read per variant: a Product with ten variants costs
   * the same round trip as one with a single variant.
   */
  listSkusByProduct(productId: ProductId): Promise<readonly SkuRecord[]>;

  /**
   * Locks the owning Product `FOR UPDATE` and returns its lifecycle state.
   *
   * Exclusive rather than shared because the variant set this transaction is
   * about to decide on hangs off this row, and two concurrent creates must
   * serialise. Returns `undefined` when no such Product exists.
   *
   * @requiresTransaction
   */
  lockProductForWrite(productId: ProductId): Promise<VariantWriteContext | undefined>;

  /**
   * The Product's whole variant set, read inside the transaction that holds its
   * lock.
   *
   * One statement for the whole set, never one per variant: both the duplicate
   * rule and the server-assigned `display_order` are properties of the set, and
   * a partial view would settle either on partial evidence.
   *
   * @requiresTransaction
   */
  listByProductForUpdate(productId: ProductId): Promise<readonly ProductVariantRecord[]>;

  /**
   * Which Product owns one variant, read without a lock.
   *
   * Used only to tell "no such variant" from "that variant belongs to another
   * product" after the locked set has already failed to contain it, so it
   * decides a message and never a write.
   */
  findOwningProduct(variantId: ProductVariantId): Promise<ProductId | undefined>;

  /** @requiresTransaction */
  insert(input: CreateProductVariantInput): Promise<ProductVariantRecord>;

  /**
   * Writes only the named fields, and always advances `updated_at`.
   *
   * @requiresTransaction
   */
  update(
    id: ProductVariantId,
    fields: UpdateProductVariantFields,
  ): Promise<ProductVariantRecord | undefined>;
}
