'use client';

/**
 * The product collection query — one cursor page at a time, per filter set.
 *
 * `useInfiniteQuery` is the canonical model for keyset continuation: it keeps
 * every fetched page in the cache under one key, so appending a page never
 * replaces the accumulated collection.
 *
 * The filters are part of the key, which is what makes the reset behaviour
 * structural: a filter change addresses a different cache entry, so the screen
 * starts from that entry's first page and pages fetched under the previous
 * filters can never be merged into it. The superseded query is left unobserved
 * and its in-flight request is aborted through the `signal` TanStack Query
 * provides.
 *
 * There is no offset, page number or total count anywhere — the contract
 * exposes none of them.
 */
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import type { AdminProductListResponse } from '@embroidery/api-client';

import { resolveNextCursor } from '../model/product-pages';
import { productQueryKeys } from '../model/product-query-keys';
import type { ProductFilters } from '../model/product-filters';
import { fetchProductPage } from '../services/product-catalog.service';

/**
 * How long a fetched page stays fresh. Positive so the server-prefetched first
 * page is not immediately refetched on mount, and short enough that a status
 * change made elsewhere is picked up by the next reconciliation.
 */
export const PRODUCT_LIST_STALE_TIME_MS = 30_000;

export type ProductListQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminProductListResponse, string | undefined>,
  Error
>;

export function useProductListQuery(filters: ProductFilters): ProductListQueryResult {
  return useInfiniteQuery({
    queryKey: productQueryKeys.list(filters),
    queryFn: ({ pageParam, signal }) => fetchProductPage({ filters, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminProductListResponse) => resolveNextCursor(lastPage) ?? null,
    staleTime: PRODUCT_LIST_STALE_TIME_MS,
    retry: false,
    // A focus-triggered refetch would re-request every loaded page.
    refetchOnWindowFocus: false,
  });
}
