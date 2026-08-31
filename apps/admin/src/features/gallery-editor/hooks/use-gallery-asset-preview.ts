'use client';

/**
 * One gallery image's bytes, as a renderable object URL (`870:926`).
 *
 * Two concerns, deliberately kept apart, exactly as `APP11-A01`'s cover preview
 * keeps them:
 *
 * - **the bytes are server state**, so TanStack Query owns fetching, caching,
 *   cancellation and failure;
 * - **the object URL is a browser resource**, so an effect owns creating it and
 *   — the part that actually matters — revoking it.
 *
 * ### A preview failure is local, and never the editor's failure
 *
 * The query is this hook's own. An image that 404s, times out or is refused
 * leaves its row rendering a neutral tile and leaves every other row, the
 * ordering controls and the save around it untouched — a missing image must
 * never be mistaken for a missing selection, and an operator must still be able
 * to remove the very image that will not load. `retry: false` keeps a broken
 * asset from becoming a loop against a private Admin endpoint.
 *
 * ### The handle never outlives what renders it
 *
 * The effect's cleanup runs when the bytes are replaced and on unmount. The URL
 * is never written to storage, never put in a route or query parameter, never
 * logged and never held in module-global state — so closing the editor leaves
 * nothing behind that could still address the bytes.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  classifyPreviewFailure,
  type GalleryPreviewFailure,
} from '../model/gallery-editor-failure';
import { galleryEditorKeys } from '../model/gallery-editor-keys';
import { fetchGalleryAssetPreview, GALLERY_ROW_RENDITION } from '../services/gallery-asset.service';

/**
 * How long fetched bytes are retained once nothing renders them.
 *
 * Bounded rather than zero. These are `GALLERY_MEDIA` / `PUBLIC` assets — the
 * images the anonymous storefront gallery serves — so retaining them briefly is
 * not the hazard that retaining a customer's private upload would be, and it is
 * what stops every reorder from re-requesting every thumbnail on screen.
 */
export const GALLERY_PREVIEW_GC_TIME_MS = 300_000;

export interface GalleryAssetPreview {
  /** A browser object URL, or `null` while loading, absent or failed. */
  readonly objectUrl: string | null;
  readonly isLoading: boolean;
  readonly failure: GalleryPreviewFailure | null;
}

export function useGalleryAssetPreview(assetId: string | undefined): GalleryAssetPreview {
  const enabled = assetId !== undefined && assetId !== '';
  const query = useQuery({
    // A disabled query still needs a key. The placeholder is never fetched
    // under, because `enabled` is false exactly when the id is absent.
    queryKey: galleryEditorKeys.assetPreview(assetId ?? '', GALLERY_ROW_RENDITION),
    queryFn: ({ signal }) => fetchGalleryAssetPreview({ assetId: assetId as string, signal }),
    enabled,
    gcTime: GALLERY_PREVIEW_GC_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const blob = enabled ? query.data : undefined;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob === undefined) {
      // Clears the handle as soon as the bytes are gone. On a replacement this
      // runs before the new ones arrive, so a stale image is never on screen.
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [blob]);

  return {
    objectUrl,
    isLoading: enabled && query.isPending,
    failure: enabled && query.isError ? classifyPreviewFailure(query.error) : null,
  };
}
