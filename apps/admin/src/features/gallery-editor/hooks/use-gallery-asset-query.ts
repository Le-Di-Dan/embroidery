'use client';

/**
 * One asset lane's pages, and the preparation mutation beside them.
 *
 * `useInfiniteQuery` keeps every fetched page under one key, so appending never
 * replaces what the operator has already scrolled past, and a failed
 * continuation leaves the accumulated pages intact for the retry.
 *
 * `enabled` gates the request on the dialog actually being open. A picker that
 * fetched on mount would pull two asset lanes on every editor screen, for every
 * operator who never opened either.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';

import { AdminAssetListScope } from '@embroidery/api-client';
import type { AdminAssetListResponse, AdminGalleryAssetResponse } from '@embroidery/api-client';

import { resolveAssetCursor, type GalleryAssetScope } from '../model/gallery-asset-lanes';
import { galleryEditorKeys } from '../model/gallery-editor-keys';
import {
  fetchGalleryAssetPage,
  prepareGalleryAsset,
  type PrepareGalleryAssetInput,
} from '../services/gallery-asset.service';

/** Short: an image prepared moments ago should appear without a manual reload. */
export const GALLERY_ASSET_STALE_TIME_MS = 15_000;

export type GalleryAssetQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminAssetListResponse, string | undefined>,
  Error
>;

export function useGalleryAssetQuery(
  scope: GalleryAssetScope,
  enabled: boolean,
): GalleryAssetQueryResult {
  return useInfiniteQuery({
    queryKey: galleryEditorKeys.assets(scope),
    queryFn: ({ pageParam, signal }) => fetchGalleryAssetPage({ scope, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `null` means "no continuation": both `hasNext` and a usable cursor are
    // required, so a stale cursor on a last page never produces a request.
    getNextPageParam: (lastPage: AdminAssetListResponse) => resolveAssetCursor(lastPage) ?? null,
    staleTime: GALLERY_ASSET_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
    enabled,
  });
}

export type GalleryPrepareAssetMutation = UseMutationResult<
  AdminGalleryAssetResponse,
  Error,
  PrepareGalleryAssetInput
>;

/**
 * Prepares one public gallery image from a catalog source.
 *
 * On success the **gallery** lane is reset rather than invalidated. Invalidation
 * marks the lane stale but keeps serving it while the refetch is in flight, and
 * that cached page is the one that does not contain the image just created — so
 * for a few hundred milliseconds the picker would be missing the very asset the
 * operator asked for. Resetting drops the stale answer instead.
 *
 * The **catalog** lane is deliberately untouched: preparation copies its source
 * and modifies nothing about it, so no page of that lane has changed.
 *
 * `retry: false`, and firmly. The operation has no promotion idempotency —
 * repeating it prepares a second, independent asset — so an automatic retry
 * after an ambiguous failure could leave an orphaned copy behind that no
 * delivered operation can remove (`FU-APP11-B03A-01`).
 */
export function useGalleryPrepareAssetMutation(): GalleryPrepareAssetMutation {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PrepareGalleryAssetInput) => prepareGalleryAsset(input),
    onSuccess: () => {
      void queryClient.resetQueries({
        queryKey: galleryEditorKeys.assets(AdminAssetListScope.GALLERY),
      });
    },
    retry: false,
  });
}
