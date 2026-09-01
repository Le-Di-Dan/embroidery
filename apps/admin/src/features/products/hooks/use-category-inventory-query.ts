'use client';

/**
 * The category inventory query (`APP12-C01-C1`).
 *
 * One cache entry for the whole taxonomy, shared by the create form, the edit
 * form and the list filter bar — the three surfaces that need to name a
 * category. There is no pagination and no filter, because the read has neither.
 *
 * ## Freshness without a deployment
 *
 * `staleTime` is short and deliberate. A category the operator publishes must
 * appear in these controls on the next reconciliation, not on the next release:
 * that is the whole property this correction restored. It is not zero, so the
 * three screens do not each re-request the same unchanged list within a single
 * task.
 *
 * `retry: false` matches the rest of this feature — a failed read surfaces as a
 * disabled control with an explanation rather than as a spinner that never ends.
 * Nothing falls back to a remembered list: the alternative to "the categories
 * could not be loaded" is never "here are the categories we shipped with".
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { productQueryKeys } from '../model/product-query-keys';
import {
  fetchCategoryInventory,
  type ProductCategory,
} from '../services/category-inventory.service';

/**
 * How long a fetched inventory stays fresh.
 *
 * Shorter than the product list's 30s: a taxonomy changes rarely, but when it
 * does an operator is usually in the middle of the very workflow that needed
 * the change.
 */
export const CATEGORY_INVENTORY_STALE_TIME_MS = 15_000;

export type CategoryInventoryQueryResult = UseQueryResult<readonly ProductCategory[], Error>;

export function useCategoryInventoryQuery(): CategoryInventoryQueryResult {
  return useQuery({
    queryKey: productQueryKeys.categories(),
    queryFn: ({ signal }) => fetchCategoryInventory(signal),
    staleTime: CATEGORY_INVENTORY_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
