'use client';

/**
 * The list query — one cursor page at a time, per filter set.
 *
 * `useInfiniteQuery` is the Admin convention for keyset continuation
 * (`APP2-A02`, `APP3-A02`, `APP5-A01`, `APP7-A01`, `APP8-A02`) and is reused
 * unchanged: it keeps every fetched page in the cache under one key, so
 * appending a page never replaces the accumulated collection, and it will not
 * issue a second `fetchNextPage` while one is in flight — which is what makes a
 * double-click on the load-more control structurally harmless rather than a
 * race a component has to guard.
 *
 * The filter is part of the key, so a filter change addresses a different cache
 * entry: the screen starts from that entry's first page, the previous cursor
 * chain is unreachable, and its in-flight request is aborted through the
 * `signal` TanStack Query provides.
 *
 * There is no offset, page number or total count anywhere — `APP11-B01`
 * exposes none of them.
 */
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import type { AdminGalleryEntryListResponse } from '@embroidery/api-client';

import type { GalleryListFilters } from '../model/gallery-list-filters';
import { galleryListKeys } from '../model/gallery-list-keys';
import { resolveGalleryNextCursor } from '../model/gallery-list-rows';
import { fetchGalleryListPage } from '../services/gallery-list.service';

/**
 * How long a fetched page stays fresh.
 *
 * Short: an entry published, archived or reordered elsewhere changes what a
 * status-filtered list should contain and in what order, so a stale list is one
 * that shows the gallery as it was. Not zero, so a remount does not re-request
 * every loaded page. There is no polling — the list fetches on navigation,
 * filter change, pagination and an explicit retry only.
 */
export const GALLERY_LIST_STALE_TIME_MS = 30_000;

export type GalleryListQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminGalleryEntryListResponse, string | undefined>,
  Error
>;

export function useGalleryListQuery(filters: GalleryListFilters): GalleryListQueryResult {
  return useInfiniteQuery({
    queryKey: galleryListKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      fetchGalleryListPage({ filters, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminGalleryEntryListResponse) =>
      resolveGalleryNextCursor(lastPage) ?? null,
    staleTime: GALLERY_LIST_STALE_TIME_MS,
    // No automatic retry: a failed load is reported with an explicit action the
    // operator triggers, never a silent loop against a private Admin endpoint.
    retry: false,
    // A focus-triggered refetch would re-request every loaded page.
    refetchOnWindowFocus: false,
  });
}
