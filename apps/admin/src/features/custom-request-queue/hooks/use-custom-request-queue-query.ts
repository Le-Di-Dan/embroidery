'use client';

/**
 * The queue query — one cursor page at a time, per filter set.
 *
 * `useInfiniteQuery` is the Admin convention for keyset continuation
 * (`APP2-A02`, `APP3-A02`) and is reused unchanged: it keeps every fetched page
 * in the cache under one key, so appending a page never replaces the
 * accumulated collection, and it will not issue a second `fetchNextPage` while
 * one is in flight — which is what makes a double-click on "Trang sau"
 * structurally harmless rather than a race a component has to guard.
 *
 * The filters are part of the key, so a filter change addresses a different
 * cache entry: the screen starts from that entry's first page, the previous
 * cursor chain is unreachable, and its in-flight request is aborted through the
 * `signal` TanStack Query provides.
 *
 * There is no offset, page number or total count anywhere — `APP5-B04` exposes
 * none of them.
 */
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import type { AdminCustomRequestQueueResponse } from '@embroidery/api-client';

import { customRequestQueueKeys } from '../model/custom-request-queue-keys';
import type { CustomRequestQueueFilters } from '../model/custom-request-queue-filters';
import { resolveNextCursor } from '../model/custom-request-queue-rows';
import { fetchCustomRequestQueuePage } from '../services/custom-request-queue.service';

/**
 * How long a fetched page stays fresh.
 *
 * Short: a moderation action taken elsewhere changes what belongs in triage, so
 * a stale queue is a queue that shows work already done. Not zero, so a remount
 * does not re-request every loaded page. There is no polling — `APP5-A01`
 * fetches on navigation, filter change and pagination only.
 */
export const CUSTOM_REQUEST_QUEUE_STALE_TIME_MS = 30_000;

export type CustomRequestQueueQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminCustomRequestQueueResponse, string | undefined>,
  Error
>;

export function useCustomRequestQueueQuery(
  filters: CustomRequestQueueFilters,
): CustomRequestQueueQueryResult {
  return useInfiniteQuery({
    queryKey: customRequestQueueKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      fetchCustomRequestQueuePage({ filters, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminCustomRequestQueueResponse) =>
      resolveNextCursor(lastPage) ?? null,
    staleTime: CUSTOM_REQUEST_QUEUE_STALE_TIME_MS,
    // No automatic retry: a failed load is reported with an explicit retry the
    // operator triggers, never a silent loop against a private Admin endpoint.
    retry: false,
    // A focus-triggered refetch would re-request every loaded page.
    refetchOnWindowFocus: false,
  });
}
