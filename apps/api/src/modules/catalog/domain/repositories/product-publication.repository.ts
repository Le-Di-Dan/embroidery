/**
 * Product publication persistence contract (`APP2-B03`, LC-04 / IMP-D035).
 *
 * A third narrow port beside the DB7 `ProductRepository` and the B02
 * `ProductDraftRepository`, for the same reason those two are separate: the
 * facts publication needs — a locked product root, the owning category's
 * publication state, the ordered media selection — are read together, under
 * locks, in one transaction. Widening either existing port with locking reads
 * would hand every current consumer a surface it must not use casually.
 *
 * Two rules shape the whole contract:
 *
 * - **Batched, never per-item.** A product with twenty images costs the same
 *   number of round trips as one with a single image.
 * - **Locked, not merely read.** The publish decision must still hold at commit,
 *   so every fact it depends on is read under a lock inside the caller's
 *   transaction. A plain read at `READ COMMITTED` would let a concurrent change
 *   commit between the check and the write.
 */
import type { ProductState } from '@embroidery/database';

import type { ProductDraft, ProductDraftId } from './product-draft.repository';

export type { ProductDraftId as ProductPublicationId };

/** The owning category's publication facts. Never its physical id. */
export interface PublicationCategoryRow {
  readonly status: string;
  readonly archivedAt: Date | undefined;
}

/** One stored media link, in `display_order`. */
export interface PublicationMediaRow {
  readonly assetId: string;
  readonly role: string;
  readonly displayOrder: number;
}

/** One variant of the product — the two fields readiness reads (`APP12-N02.B01`). */
export interface PublicationVariantRow {
  readonly variantId: string;
  readonly isActive: boolean;
}

/** One SKU under those variants, with the override that may price it. */
export interface PublicationSkuRow {
  readonly skuId: string;
  readonly variantId: string;
  readonly isActive: boolean;
  readonly priceOverrideAmount: string | undefined;
  readonly currencyCode: string;
}

/**
 * Everything a readiness evaluation needs about one product, read together.
 *
 * `product` is `undefined` when no such row exists, which is the caller's
 * `PRODUCT_NOT_FOUND`; `category` is `undefined` only if the owning row
 * vanished, which readiness reports as an unsatisfied category requirement
 * rather than as a crash.
 *
 * `variants` and `skus` were added by `APP12-N02.B01`. Before it this snapshot
 * read the product, its category and its media and **nothing else**, which is
 * why readiness was not merely lenient about sellability but blind to it: there
 * was no fact in the shape a requirement could have been written against.
 *
 * Neither carries a stock row, a quantity or a threshold, and the shape is the
 * enforcement: an evaluator cannot read a field the snapshot has no place for.
 */
export interface ProductPublicationSnapshot {
  readonly product: ProductDraft | undefined;
  readonly category: PublicationCategoryRow | undefined;
  readonly media: readonly PublicationMediaRow[];
  readonly variants: readonly PublicationVariantRow[];
  readonly skus: readonly PublicationSkuRow[];
}

export interface PublishProductInput {
  readonly id: ProductDraftId;
  /** Database truth this write may overwrite; the new token is database-owned. */
  readonly expectedUpdatedAt: Date;
  readonly fromStates: readonly ProductState[];
  readonly toState: ProductState;
}

export const PRODUCT_PUBLICATION_REPOSITORY = Symbol('PRODUCT_PUBLICATION_REPOSITORY');

export interface ProductPublicationRepository {
  /**
   * The side-effect-free snapshot behind `GET .../publication-readiness`.
   *
   * Takes no lock and opens no transaction: a readiness read must not block a
   * concurrent edit, and it makes no promise that survives its own response —
   * publish re-reads everything under locks and decides again.
   */
  readSnapshot(id: ProductDraftId): Promise<ProductPublicationSnapshot>;

  /**
   * The same snapshot, with the product root locked `FOR UPDATE` and the
   * category and media rows locked `FOR SHARE`.
   *
   * The product is locked exclusively because this transaction intends to write
   * it; the category and media are locked in share mode because this
   * transaction only needs them to stay as they are — an exclusive lock there
   * would serialise unrelated publishes of products in the same category.
   *
   * **Variants and SKUs are read inside the transaction but are deliberately
   * not row-locked** (`APP12-N02.B01`). They do not need to be: every writer of
   * either must take a lock on the owning `products` row before it mutates —
   * `APP12-N02.B01` takes it `FOR UPDATE`, `APP7-B01` takes it `FOR SHARE` —
   * and this transaction is already holding that row exclusively, so no variant
   * or SKU write for this product can commit between this read and this commit.
   * Locking them anyway would be worse than redundant: `APP7-B01` locks the
   * variant *before* the product, so a share lock taken here in the opposite
   * order would create a deadlock cycle that does not exist today.
   *
   * @requiresTransaction
   */
  lockSnapshot(id: ProductDraftId): Promise<ProductPublicationSnapshot>;

  /**
   * The guarded lifecycle transition: identity, allowed source states and the
   * exact `updated_at` all travel into one UPDATE, which also advances the
   * token by the accepted database-owned monotonic mechanism.
   *
   * Writes `status` and `updated_at` and nothing else — never `archived_at`,
   * never a field, never a media link.
   *
   * @requiresTransaction
   */
  transitionGuarded(input: PublishProductInput): Promise<ProductDraft | undefined>;

  /**
   * Why a guarded transition matched nothing, read in the same transaction.
   *
   * @requiresTransaction
   */
  explainTransitionMiss(
    id: ProductDraftId,
    expectedUpdatedAt: Date,
    allowedStates: readonly ProductState[],
  ): Promise<'NOT_FOUND' | 'STATE' | 'STALE'>;
}
