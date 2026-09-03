'use client';

/**
 * The Admin category inventory query (`APP12-A01`).
 *
 * One cache entry for the whole taxonomy. There is no pagination and no filter
 * because the read has neither, and no `select` narrowing the rows: the
 * management screen shows every state, so the list *is* the data.
 *
 * `staleTime` is short and deliberate. A category the operator creates or
 * publishes must appear on the next reconciliation, not on the next release —
 * that is the property `CATEGORY_MODEL = DYNAMIC` exists to deliver. It is not
 * zero, so returning to this screen inside one task does not re-request an
 * unchanged taxonomy.
 *
 * `retry: false` matches the rest of the Admin: a failed read surfaces as an
 * explained, retryable empty state rather than a spinner that never ends.
 * Nothing falls back to a remembered list — the alternative to "the categories
 * could not be loaded" is never "here are the categories we shipped with".
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { categoryQueryKeys } from '../model/category-query-keys';
import { fetchAdminCategories, type AdminCategory } from '../services/admin-category.service';

/** How long a fetched taxonomy stays fresh. Matches the product feature's. */
export const CATEGORY_INVENTORY_STALE_TIME_MS = 15_000;

export type CategoryInventoryQueryResult = UseQueryResult<readonly AdminCategory[], Error>;

export function useAdminCategoryInventoryQuery(): CategoryInventoryQueryResult {
  return useQuery({
    queryKey: categoryQueryKeys.inventory(),
    queryFn: ({ signal }) => fetchAdminCategories(signal),
    staleTime: CATEGORY_INVENTORY_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
