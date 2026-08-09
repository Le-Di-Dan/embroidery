'use client';

/**
 * The Template collection — one cursor page at a time, per filter set.
 *
 * `useInfiniteQuery` is the canonical model for keyset continuation: every
 * fetched page lives in the cache under one key, so appending a page never
 * replaces what the operator has already scrolled past, and a failed
 * continuation leaves the accumulated pages intact for the retry.
 *
 * The filters are part of the key, which is what makes the reset behaviour
 * **structural**: a filter change addresses a different cache entry, so the
 * screen starts from that entry's first page and pages fetched under the
 * previous filters can never be merged into it. The superseded query is left
 * unobserved and its in-flight request is aborted through TanStack Query's
 * `signal`. There is no manual "reset the cursor" step to forget.
 *
 * No offset, page number or total count appears anywhere — the contract exposes
 * none of them.
 */
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import type { AdminDesignTemplateListResponse } from '@embroidery/api-client';

import type { DesignTemplateFilters } from '../model/design-template-filters';
import {
  designTemplateQueryKeys,
  TEMPLATE_LIST_PAGE_SIZE,
} from '../model/design-template-query-keys';
import { resolveNextCursor } from '../model/design-template-rows';
import { fetchTemplatePage } from '../services/design-template.service';

/**
 * How long a fetched page stays fresh. Short enough that a template created or
 * published elsewhere is picked up by the next reconciliation, long enough that
 * ordinary re-renders do not re-request every loaded page.
 */
export const TEMPLATE_LIST_STALE_TIME_MS = 30_000;

export type DesignTemplateListQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminDesignTemplateListResponse, string | undefined>,
  Error
>;

export function useDesignTemplateListQuery(
  filters: DesignTemplateFilters,
): DesignTemplateListQueryResult {
  return useInfiniteQuery({
    queryKey: designTemplateQueryKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      fetchTemplatePage({
        filters,
        pageSize: TEMPLATE_LIST_PAGE_SIZE,
        cursor: pageParam,
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminDesignTemplateListResponse) =>
      resolveNextCursor(lastPage) ?? null,
    staleTime: TEMPLATE_LIST_STALE_TIME_MS,
    retry: false,
    // A focus-triggered refetch would re-request every loaded page.
    refetchOnWindowFocus: false,
  });
}
