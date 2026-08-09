/**
 * The query-key factory for the Admin Design Template capability.
 *
 * A list key carries the page size and both filter values and nothing else. It
 * is serialized into the cache, so a credential, an `AbortSignal`, a raw error
 * or a DOM value would outlive the request that produced it and must never
 * appear here.
 *
 * The filters are part of the key on purpose: changing a filter addresses a
 * different cache entry, which is what makes "reset the cursor, fetch a fresh
 * first page, never merge pages across filters" **structural** rather than a
 * rule some component has to remember to apply.
 */
import type { DesignTemplateFilters } from './design-template-filters';

/** Client request size for one page; the contract allows 1–100. */
export const TEMPLATE_LIST_PAGE_SIZE = 20;

const ROOT = ['admin', 'design-templates'] as const;

export const designTemplateQueryKeys = {
  all: ROOT,
  list: (filters: DesignTemplateFilters, pageSize: number = TEMPLATE_LIST_PAGE_SIZE) =>
    [...ROOT, 'list', { pageSize, status: filters.status, productId: filters.productId }] as const,
  /** Every list entry, regardless of filters — the invalidation target after a create. */
  lists: () => [...ROOT, 'list'] as const,
} as const;
