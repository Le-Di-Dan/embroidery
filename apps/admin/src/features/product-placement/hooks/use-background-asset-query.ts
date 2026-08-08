'use client';

/**
 * The background picker's asset collection — one cursor page at a time.
 *
 * `useInfiniteQuery` keeps every fetched page under one key, so appending never
 * replaces what the operator has already scrolled past, and a failed
 * continuation leaves the accumulated pages intact for the retry.
 *
 * `enabled` gates the request on the dialog actually being open: a picker that
 * fetched on mount would pull the asset library on every placement screen, for
 * every operator who never opens it.
 */
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import type { AdminAssetListResponse } from '@embroidery/api-client';

import { resolveBackgroundCursor } from '../model/background-eligibility';
import { placementQueryKeys } from '../model/placement-query-keys';
import { fetchBackgroundAssetPage } from '../services/background-asset.service';

/** Short: an asset accepted moments ago should appear without a manual reload. */
export const BACKGROUND_ASSET_STALE_TIME_MS = 15_000;

export type BackgroundAssetQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminAssetListResponse, string | undefined>,
  Error
>;

export function useBackgroundAssetQuery(enabled: boolean): BackgroundAssetQueryResult {
  return useInfiniteQuery({
    queryKey: [...placementQueryKeys.all, 'background-assets'] as const,
    queryFn: ({ pageParam, signal }) => fetchBackgroundAssetPage({ cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminAssetListResponse) =>
      resolveBackgroundCursor(lastPage) ?? null,
    staleTime: BACKGROUND_ASSET_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
    enabled,
  });
}
