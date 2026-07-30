/**
 * Admin product-draft persistence contract (`APP2-B02`).
 *
 * A separate port from the DB7 `ProductRepository` on purpose. That one is the
 * AGG-06 aggregate contract Design, Approval and Production already depend on
 * through the placement hierarchy; widening it with Admin list paging, guarded
 * updates and ordered media replacement would make every one of those consumers
 * recompile against a surface they do not use. This port owns exactly the draft
 * management operations B02 adds, and nothing here duplicates a DB7 method —
 * category lookup still goes through `CategoryRepository.findBySlug`.
 */
import type { ProductState } from '@embroidery/database';

import type { ProductId } from './placement-hierarchy.port';

export type ProductDraftId = ProductId;

/** One product row, as the Admin draft surface sees it. */
export interface ProductDraft {
  readonly id: ProductDraftId;
  readonly categoryId: string;
  readonly categorySlug: string;
  readonly name: string;
  /** Server-owned and immutable in APP2-B02. */
  readonly slug: string;
  readonly description: string | undefined;
  /** Minor units as a string. `numeric` never becomes a JavaScript number. */
  readonly basePriceAmount: string;
  readonly currencyCode: string;
  readonly status: ProductState;
  readonly displayOrder: number;
  readonly archivedAt: Date | undefined;
  readonly createdAt: Date;
  /** The optimistic-concurrency token; there is no version column. */
  readonly updatedAt: Date;
}

/** One ordered media link, with the safe Asset identity the Admin may see. */
export interface ProductDraftMedia {
  readonly assetId: string;
  readonly role: string;
  readonly displayOrder: number;
  readonly mediaType: string;
  /** `bigint` in the row; narrowed to a number only at the projection. */
  readonly byteSize: bigint;
  readonly status: string;
  readonly assetCreatedAt: Date;
}

export interface ProductDraftListFilter {
  readonly status?: ProductState | undefined;
  readonly categoryId?: string | undefined;
}

export interface ProductDraftListQuery {
  readonly filter: ProductDraftListFilter;
  /** Resume position from the previous page; absent for the first page. */
  readonly after?: { readonly createdAt: Date; readonly id: string } | undefined;
  /** The repository fetches `limit + 1` so the caller can detect a next page. */
  readonly limit: number;
}

export interface CreateProductDraftInput {
  readonly id: ProductDraftId;
  readonly categoryId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | undefined;
  readonly basePriceAmount: string;
  readonly displayOrder: number;
  /** Written explicitly so the concurrency token round-trips at ms precision. */
  readonly at: Date;
}

/** Only the fields a DRAFT may change; `undefined` means "not in this patch". */
export interface UpdateProductDraftFields {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly basePriceAmount?: string | undefined;
  readonly categoryId?: string | undefined;
}

export interface UpdateProductDraftInput {
  readonly id: ProductDraftId;
  /** Database truth this write is allowed to overwrite. */
  readonly expectedUpdatedAt: Date;
  readonly editableStates: readonly ProductState[];
  readonly fields: UpdateProductDraftFields;
  readonly at: Date;
}

export interface ArchiveProductDraftInput {
  readonly id: ProductDraftId;
  readonly expectedUpdatedAt: Date;
  readonly archivableStates: readonly ProductState[];
  readonly at: Date;
}

/** One media link to write, already ordered and role-assigned by the service. */
export interface ProductDraftMediaLink {
  readonly assetId: string;
  readonly role: string;
  readonly displayOrder: number;
}

/**
 * Why a guarded write matched nothing.
 *
 * The repository reports the reason rather than the caller re-reading the row:
 * a second read outside the guard could observe a different state than the one
 * the UPDATE actually tested, which is the race the guard exists to close.
 */
export type GuardedWriteFailure = 'NOT_FOUND' | 'STATE' | 'STALE';

export type GuardedWriteResult =
  | { readonly ok: true; readonly product: ProductDraft }
  | { readonly ok: false; readonly reason: GuardedWriteFailure };

export const PRODUCT_DRAFT_REPOSITORY = Symbol('PRODUCT_DRAFT_REPOSITORY');

export interface ProductDraftRepository {
  /** @requiresTransaction */
  create(input: CreateProductDraftInput): Promise<ProductDraft>;

  /**
   * Guarded field update: identity + editable state + exact `updated_at`, all
   * in the same statement.
   *
   * @requiresTransaction
   */
  updateGuarded(input: UpdateProductDraftInput): Promise<GuardedWriteResult>;

  /**
   * Guarded lifecycle transition to `ARCHIVED`, stamping `archived_at`.
   *
   * @requiresTransaction
   */
  archiveGuarded(input: ArchiveProductDraftInput): Promise<GuardedWriteResult>;

  /**
   * Replaces the whole media selection for one product.
   *
   * Complete replacement rather than a diff: the request carries the intended
   * final order, and applying it as a set of adds and removes would leave a
   * window in which the stored order is neither the old one nor the new one.
   * Deletes links only — never an Asset, a derivative or a stored object.
   *
   * @requiresTransaction
   */
  replaceMedia(productId: ProductDraftId, links: readonly ProductDraftMediaLink[]): Promise<void>;

  findById(id: ProductDraftId): Promise<ProductDraft | undefined>;

  /**
   * Slug reservation lookup. Global, not scoped to a state: `uq_products__slug`
   * is unique across DRAFT, PUBLISHED and ARCHIVED alike, so an archived
   * product still owns its address.
   */
  findBySlug(slug: string): Promise<ProductDraft | undefined>;

  /** Keyset page ordered `created_at DESC, id DESC`; fetches `limit + 1`. */
  list(query: ProductDraftListQuery): Promise<ProductDraft[]>;

  /** Ordered media for one product, with safe Asset identity joined in. */
  findMedia(productId: ProductDraftId): Promise<ProductDraftMedia[]>;

  /** Ordered media for several products in one round trip (no N+1 in list). */
  findMediaFor(productIds: readonly ProductDraftId[]): Promise<Map<string, ProductDraftMedia[]>>;
}
