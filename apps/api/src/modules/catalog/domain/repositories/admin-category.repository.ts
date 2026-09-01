/**
 * The Admin category management port (`APP12-C02`).
 *
 * A fourth narrow Catalog port, for the reason the other three are separate:
 * what category *administration* needs — a locked row, a dependent-Product
 * count, a guarded lifecycle transition — is nothing the DB7 `CategoryRepository`
 * offers, and widening that one would hand the placement hierarchy, the draft
 * service and every Design consumer a locking surface they must not use.
 *
 * `PublicCategoryRepository` stays untouched and unreachable from here: it is a
 * read port that applies the anonymous visibility predicate. This port sees
 * every row in every state, which is precisely why the two must not be one.
 *
 * ## Locking is part of the contract, not an implementation detail
 *
 * `lockById` is what makes the archive guard a real invariant rather than a
 * check-then-update race. The Product publication path already takes a
 * `FOR SHARE` lock on the owning category row inside its own transaction
 * (`drizzle-product-publication.repository.ts`), so an exclusive lock here is
 * mutually exclusive with a concurrent publish under the same category: one of
 * the two waits, and whichever arrives second re-reads committed truth and
 * refuses. No advisory locks, no new subsystem — the seam already existed.
 */
import type { CategoryState } from '@embroidery/database';

import type { CategoryId } from './product.repository';

/** One category row, as the Admin surface sees it. Every state, every column it owns. */
export interface AdminCategory {
  readonly id: CategoryId;
  readonly slug: string;
  readonly name: string;
  readonly status: CategoryState;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
  readonly archivedAt: Date | undefined;
  /** The optimistic-concurrency token; there is no version column. */
  readonly updatedAt: Date;
}

/**
 * One list row, with the dependency fact the operator needs before archiving.
 *
 * Derived per read from `products`, never stored: a counter column would be a
 * second truth about the same rows, and the one that goes stale silently. The
 * archive guard re-counts inside its own transaction regardless, so this number
 * is a display aid and is documented as one.
 */
export interface AdminCategoryListEntry extends AdminCategory {
  readonly publishedProductCount: number;
}

export interface CreateCategoryInput {
  readonly id: CategoryId;
  readonly slug: string;
  readonly name: string;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
}

/** Only the fields an operator may change; `undefined` means "not in this patch". */
export interface UpdateCategoryFields {
  readonly slug?: string | undefined;
  readonly name?: string | undefined;
  readonly isIndexable?: boolean | undefined;
  readonly displayOrder?: number | undefined;
}

export interface UpdateCategoryInput {
  readonly id: CategoryId;
  /** Database truth this write may overwrite; the new token is database-owned. */
  readonly expectedUpdatedAt: Date;
  readonly fields: UpdateCategoryFields;
}

export interface TransitionCategoryInput {
  readonly id: CategoryId;
  readonly expectedUpdatedAt: Date;
  readonly fromState: CategoryState;
  readonly toState: CategoryState;
  /** Stamped only when moving to the archived state; never cleared here. */
  readonly archivedAt: Date | undefined;
}

export const ADMIN_CATEGORY_REPOSITORY = Symbol('ADMIN_CATEGORY_REPOSITORY');

export interface AdminCategoryRepository {
  /**
   * The whole taxonomy in `(display_order, slug)` order, with each row's
   * published-Product count.
   *
   * One statement, not one per category: the count is a grouped aggregate, so a
   * store with fifty categories costs the same round trip as one with three.
   * `limit` is a safety bound the caller sets one above its own cap, so an
   * inventory larger than the contract can carry is detectable rather than
   * silently truncated.
   */
  list(limit: number): Promise<readonly AdminCategoryListEntry[]>;

  /** @requiresTransaction */
  create(input: CreateCategoryInput): Promise<AdminCategory>;

  /**
   * The row, locked `FOR UPDATE` for the rest of the transaction.
   *
   * Exclusive because every caller intends to write it, and because that is
   * what serialises an archive against a concurrent Product publication holding
   * the same row `FOR SHARE`.
   *
   * @requiresTransaction
   */
  lockById(id: CategoryId): Promise<AdminCategory | undefined>;

  /**
   * Whether any *other* category already holds `slug`.
   *
   * A pre-check so the caller can refuse with its own stable code before the
   * insert or update aborts the transaction on `uq_categories__slug`. It is not
   * the safety mechanism — the arbiter is, and the repository maps its rejection
   * through the same code — but a caught constraint error later in a transaction
   * has already poisoned it.
   */
  slugTakenByOther(slug: string, exceptId: CategoryId | undefined): Promise<boolean>;

  /**
   * How many PUBLISHED Products currently point at this category.
   *
   * Read inside the archive transaction, under the category lock, so the answer
   * still holds at commit. Never trusts a count the client last displayed.
   *
   * @requiresTransaction
   */
  countPublishedProducts(id: CategoryId): Promise<number>;

  /**
   * Guarded field update: identity and the exact `updated_at` in one statement.
   * Returns `undefined` when nothing matched.
   *
   * Never writes `status` or `archived_at` — lifecycle belongs to
   * {@link transitionGuarded} alone, so no patch body can move a row through
   * the state machine sideways.
   *
   * @requiresTransaction
   */
  updateGuarded(input: UpdateCategoryInput): Promise<AdminCategory | undefined>;

  /**
   * Guarded lifecycle transition: identity, the one allowed source state and
   * the exact token all travel into one UPDATE.
   *
   * @requiresTransaction
   */
  transitionGuarded(input: TransitionCategoryInput): Promise<AdminCategory | undefined>;
}
