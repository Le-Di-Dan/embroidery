/**
 * The one query-key factory for the Admin product capability.
 *
 * A key carries the page size and the two filter values and nothing else. It is
 * serialized into the cache, so a credential, an `AbortSignal`, a raw error or
 * a DOM value would outlive the request that produced it and must never appear
 * here.
 *
 * The filters are part of the key on purpose: changing a filter addresses a
 * different cache entry, which is what makes "reset pagination, fetch a fresh
 * first page, never merge pages across filters" structural rather than a rule
 * some component has to remember to apply.
 */
import type { ProductFilters } from './product-filters';

/** Client request size for one page; the contract allows 1–100. */
export const PRODUCT_LIST_PAGE_SIZE = 20;

const ROOT = ['admin', 'products'] as const;

/** Client request size for one page of the asset picker; the contract allows 1–100. */
export const PRODUCT_ASSET_PAGE_SIZE = 24;

export const productQueryKeys = {
  all: ROOT,
  list: (filters: ProductFilters, pageSize: number = PRODUCT_LIST_PAGE_SIZE) =>
    [...ROOT, 'list', { pageSize, status: filters.status, category: filters.category }] as const,
  /** Every list entry, regardless of filters — the invalidation target after a save. */
  lists: () => [...ROOT, 'list'] as const,
  /**
   * One authoritative product. Keyed by the server's id alone: the form values,
   * the dirty flag and the concurrency token all derive from the cached record,
   * so none of them belongs in the key.
   */
  detail: (productId: string) => [...ROOT, 'detail', productId] as const,
  /** Selectable catalog media for the picker dialog. */
  selectableAssets: (pageSize: number = PRODUCT_ASSET_PAGE_SIZE) =>
    [...ROOT, 'selectable-assets', { pageSize }] as const,
} as const;
