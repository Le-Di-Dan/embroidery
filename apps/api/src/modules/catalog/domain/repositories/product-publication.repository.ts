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

/**
 * Everything a readiness evaluation needs about one product, read together.
 *
 * `product` is `undefined` when no such row exists, which is the caller's
 * `PRODUCT_NOT_FOUND`; `category` is `undefined` only if the owning row
 * vanished, which readiness reports as an unsatisfied category requirement
 * rather than as a crash.
 */
export interface ProductPublicationSnapshot {
  readonly product: ProductDraft | undefined;
  readonly category: PublicationCategoryRow | undefined;
  readonly media: readonly PublicationMediaRow[];
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
