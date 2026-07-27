'use client';

/**
 * The asset collection query — one cursor page at a time.
 *
 * `useInfiniteQuery` is the canonical model for keyset continuation: it keeps
 * every fetched page in the cache under one key, so appending a page never
 * replaces the accumulated collection and an invalidation refetches the pages
 * the operator already has instead of collapsing back to page one.
 *
 * There is no offset, page number or total count anywhere — the contract
 * exposes none of them.
 */
import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query';

import type { AdminAssetListResponse } from '@embroidery/api-client';

import { fetchAssetPage } from '../services/asset-catalog.service';
import { resolveNextCursor } from '../model/asset-pages';
import { assetQueryKeys } from '../model/asset-query-keys';

/**
 * How long a fetched page stays fresh. It is positive so the server-prefetched
 * first page is not immediately refetched on mount, and short enough that a
 * status change is picked up by the next authoritative reconciliation.
 */
export const ASSET_LIST_STALE_TIME_MS = 30_000;

export type AssetListQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminAssetListResponse, string | undefined>,
  Error
>;

export function useAssetListQuery(): AssetListQueryResult {
  return useInfiniteQuery({
    queryKey: assetQueryKeys.list(),
    queryFn: ({ pageParam, signal }) => fetchAssetPage({ cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminAssetListResponse) => resolveNextCursor(lastPage) ?? null,
    staleTime: ASSET_LIST_STALE_TIME_MS,
    retry: false,
    // A focus-triggered refetch would re-request every loaded page; the screen
    // reconciles explicitly after an upload instead.
    refetchOnWindowFocus: false,
  });
}
