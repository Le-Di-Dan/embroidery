'use client';

/**
 * The queue query — one cursor page at a time, per filter set.
 *
 * `useInfiniteQuery` is the Admin convention for keyset continuation
 * (`APP2-A02`, `APP3-A02`, `APP5-A01`, `APP7-A01`) and is reused unchanged: it
 * keeps every fetched page in the cache under one key, so appending a page never
 * replaces the accumulated collection, and it will not issue a second
 * `fetchNextPage` while one is in flight — which is what makes a double-click on
 * the load-more control structurally harmless rather than a race a component has
 * to guard.
 *
 * The filters are part of the key, so a filter change addresses a different
 * cache entry: the screen starts from that entry's first page, the previous
 * cursor chain is unreachable, and its in-flight request is aborted through the
 * `signal` TanStack Query provides.
 *
 * There is no offset, page number or total count anywhere — `APP8-B03` exposes
 * none of them.
 */
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import type { AdminProductionJobQueueResponse } from '@embroidery/api-client';

import type { ProductionQueueFilters } from '../model/production-queue-filters';
import { productionQueueKeys } from '../model/production-queue-keys';
import { resolveProductionNextCursor } from '../model/production-queue-rows';
import { fetchProductionQueuePage } from '../services/production-queue.service';

/**
 * How long a fetched page stays fresh.
 *
 * Short: a job that starts or completes elsewhere changes what a status-filtered
 * queue should contain, so a stale queue is one that shows work already done.
 * Not zero, so a remount does not re-request every loaded page. There is no
 * polling — the queue fetches on navigation, filter change, pagination and an
 * explicit reload only.
 */
export const PRODUCTION_QUEUE_STALE_TIME_MS = 30_000;

export type ProductionQueueQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminProductionJobQueueResponse, string | undefined>,
  Error
>;

export function useProductionQueueQuery(
  filters: ProductionQueueFilters,
): ProductionQueueQueryResult {
  return useInfiniteQuery({
    queryKey: productionQueueKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      fetchProductionQueuePage({ filters, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminProductionJobQueueResponse) =>
      resolveProductionNextCursor(lastPage) ?? null,
    staleTime: PRODUCTION_QUEUE_STALE_TIME_MS,
    // No automatic retry: a failed load is reported with an explicit action the
    // operator triggers, never a silent loop against a private Admin endpoint.
    // The approved conflict spec (`787:149`) forbids automatic retry outright.
    retry: false,
    // A focus-triggered refetch would re-request every loaded page.
    refetchOnWindowFocus: false,
  });
}

/**
 * "Về trang đầu" (`782:245`), implemented as what it says.
 *
 * A rejected cursor cannot be retried — the server will refuse it again — so
 * `refetch()` would replay the same failing page. Resetting the entry discards
 * every accumulated page and the whole cursor chain with them, and the query
 * then starts from `initialPageParam`, i.e. genuinely from the first page.
 *
 * Only this feature's own filtered entry is reset. Nothing here flushes the
 * cache wholesale: a queue failure is no reason to throw away the session
 * identity or another screen's data.
 */
export function useProductionQueueReset(filters: ProductionQueueFilters): () => void {
  const queryClient = useQueryClient();
  // Built inside the callback rather than in the render body: the key is a fresh
  // array every render, so closing over it would make the callback identity
  // change on every render while its *meaning* — the filters — had not.
  return useCallback(() => {
    void queryClient.resetQueries({ queryKey: productionQueueKeys.list(filters) });
  }, [queryClient, filters]);
}
