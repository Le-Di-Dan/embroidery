'use client';

/**
 * The queue query — one cursor page at a time, per filter set.
 *
 * `useInfiniteQuery` is the Admin convention for keyset continuation
 * (`APP2-A02`, `APP3-A02`, `APP5-A01`) and is reused unchanged: it keeps every
 * fetched page in the cache under one key, so appending a page never replaces
 * the accumulated collection, and it will not issue a second `fetchNextPage`
 * while one is in flight — which is what makes a double-click on the load-more
 * control structurally harmless rather than a race a component has to guard.
 *
 * The filters are part of the key, so a filter change addresses a different
 * cache entry: the screen starts from that entry's first page, the previous
 * cursor chain is unreachable, and its in-flight request is aborted through the
 * `signal` TanStack Query provides.
 *
 * There is no offset, page number or total count anywhere — `APP7-B02` exposes
 * none of them.
 */
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import type { AdminOrderQueueResponse } from '@embroidery/api-client';

import type { OrderQueueFilters } from '../model/order-queue-filters';
import { orderQueueKeys } from '../model/order-queue-keys';
import { resolveOrderNextCursor } from '../model/order-queue-rows';
import { fetchOrderQueuePage } from '../services/order-queue.service';

/**
 * How long a fetched page stays fresh.
 *
 * Short: an order that reaches `DEPOSIT_PAID` elsewhere changes what a filtered
 * queue should contain, so a stale queue is one that shows work already done.
 * Not zero, so a remount does not re-request every loaded page. There is no
 * polling — the queue fetches on navigation, filter change, pagination and an
 * explicit invalidation only.
 */
export const ORDER_QUEUE_STALE_TIME_MS = 30_000;

export type OrderQueueQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminOrderQueueResponse, string | undefined>,
  Error
>;

export function useOrderQueueQuery(filters: OrderQueueFilters): OrderQueueQueryResult {
  return useInfiniteQuery({
    queryKey: orderQueueKeys.list(filters),
    queryFn: ({ pageParam, signal }) => fetchOrderQueuePage({ filters, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminOrderQueueResponse) =>
      resolveOrderNextCursor(lastPage) ?? null,
    staleTime: ORDER_QUEUE_STALE_TIME_MS,
    // No automatic retry: a failed load is reported with an explicit retry the
    // operator triggers, never a silent loop against a private Admin endpoint.
    retry: false,
    // A focus-triggered refetch would re-request every loaded page.
    refetchOnWindowFocus: false,
  });
}
