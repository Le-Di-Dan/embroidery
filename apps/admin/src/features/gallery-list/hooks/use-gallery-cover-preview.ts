'use client';

/**
 * One gallery cover thumbnail, as a renderable object URL (`866:905`).
 *
 * Two concerns, deliberately kept apart, exactly as `APP7-A01`'s evidence
 * preview keeps them:
 *
 * - **the bytes are server state**, so TanStack Query owns fetching, caching,
 *   cancellation and failure;
 * - **the object URL is a browser resource**, so an effect owns creating it and
 *   — the part that actually matters — revoking it.
 *
 * ### A cover failure is local, and never the list's failure
 *
 * The query is this hook's own. A cover that 404s, times out or is refused
 * leaves the row rendering a neutral tile and leaves every other row and the
 * collection around it untouched — a missing image must never be mistaken for a
 * missing entry. `retry: false` keeps a broken asset from becoming a loop
 * against a private Admin endpoint, and there is no automatic refetch.
 *
 * ### `gcTime` is bounded, not zero
 *
 * `APP7-A01` used `gcTime: 0` because its bytes were a customer's private
 * banking screenshots and retaining them after nothing rendered them was the
 * browser-side version of the thing `no-store` exists to prevent. These bytes
 * are different in kind: `APP11-B03A` resolves only `GALLERY_MEDIA` / `PUBLIC`
 * assets, which are the images the anonymous storefront gallery serves. So the
 * entry is retained for the length of a paging session, which is what keeps
 * "Tải thêm mục" from re-requesting every thumbnail already on screen, and is
 * dropped soon after the screen is left rather than being held indefinitely.
 *
 * The object URL itself never outlives what renders it: the effect's cleanup
 * runs when the bytes are replaced and on unmount, the handle is never written
 * to storage, never put in a route or query parameter, never logged and never
 * held in module-global state.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  classifyGalleryCoverFailure,
  type GalleryCoverFailure,
} from '../model/gallery-list-failure';
import { galleryListKeys } from '../model/gallery-list-keys';
import { fetchGalleryCover, GALLERY_COVER_RENDITION } from '../services/gallery-list.service';

/** How long fetched cover bytes are retained once nothing renders them. */
export const GALLERY_COVER_GC_TIME_MS = 300_000;

export interface GalleryCoverPreview {
  /** A browser object URL, or `null` while loading, absent or failed. */
  readonly objectUrl: string | null;
  readonly isLoading: boolean;
  readonly failure: GalleryCoverFailure | null;
}

export interface UseGalleryCoverPreviewInput {
  /** The cover asset's id, or `undefined` for an entry that has no images. */
  readonly assetId: string | undefined;
}

export function useGalleryCoverPreview({
  assetId,
}: UseGalleryCoverPreviewInput): GalleryCoverPreview {
  const enabled = assetId !== undefined;
  const query = useQuery({
    // A disabled query still needs a key. The placeholder is never fetched
    // under, because `enabled` is false exactly when the id is absent.
    queryKey: galleryListKeys.cover(assetId ?? '', GALLERY_COVER_RENDITION),
    queryFn: ({ signal }) => fetchGalleryCover({ assetId: assetId as string, signal }),
    enabled,
    gcTime: GALLERY_COVER_GC_TIME_MS,
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
    failure: enabled && query.isError ? classifyGalleryCoverFailure(query.error) : null,
  };
}
