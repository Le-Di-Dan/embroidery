'use client';

/**
 * The picker's asset collection — one cursor page at a time.
 *
 * `useInfiniteQuery` keeps every fetched page under one key, so appending never
 * replaces what the operator has already scrolled past, and a failed
 * continuation leaves the accumulated pages intact for the retry.
 *
 * `enabled` gates the request on the dialog actually being open: a picker that
 * fetched on mount would pull the asset library on every product screen, for
 * every operator who never opens it.
 */
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

import type { AdminAssetListResponse } from '@embroidery/api-client';

import { resolveAssetCursor } from '../model/product-asset-eligibility';
import { productQueryKeys } from '../model/product-query-keys';
import { fetchSelectableAssetPage } from '../services/product-asset-picker.service';

/** Short: an asset accepted moments ago should appear without a manual reload. */
export const SELECTABLE_ASSET_STALE_TIME_MS = 15_000;

export type SelectableAssetQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminAssetListResponse, string | undefined>,
  Error
>;

export function useSelectableAssetQuery(enabled: boolean): SelectableAssetQueryResult {
  return useInfiniteQuery({
    queryKey: productQueryKeys.selectableAssets(),
    queryFn: ({ pageParam, signal }) => fetchSelectableAssetPage({ cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminAssetListResponse) => resolveAssetCursor(lastPage) ?? null,
    staleTime: SELECTABLE_ASSET_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
    enabled,
  });
}
