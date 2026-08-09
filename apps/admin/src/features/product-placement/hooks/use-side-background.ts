'use client';

/**
 * One Side's authorized background, as a renderable object URL.
 *
 * Two concerns, deliberately kept apart:
 *
 * - **the bytes are server state**, so TanStack Query owns fetching, caching,
 *   cancellation and failure;
 * - **the object URL is a browser resource**, so an effect owns creating it and
 *   — the part that actually matters — revoking it.
 *
 * `gcTime: 0` is the important setting. `APP3-B02A` answers `no-store` because
 * these bytes may belong to a Product that was never published; retaining them
 * in a cache after nothing is rendering them would keep protected media alive in
 * memory long after the operator navigated away, which is the browser-side
 * version of the thing `no-store` exists to prevent. Dropping the entry the
 * moment it is unobserved also means switching back to a Side re-authorizes it
 * against the server rather than trusting a snapshot.
 *
 * There is no `placeholderData`. Keeping the previous entry's data while a new
 * key loads is exactly how the previous Side's image would appear beneath the
 * new Side's areas — so the absence is load-bearing, not an omission.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { classifyBackgroundFailure, type BackgroundFailure } from '../model/placement-failure';
import { placementQueryKeys } from '../model/placement-query-keys';
import { fetchSideBackground } from '../services/side-background.service';

export interface SideBackground {
  /** A browser object URL, or `null` while absent, loading or failed. */
  readonly objectUrl: string | null;
  readonly isLoading: boolean;
  readonly failure: BackgroundFailure | null;
  readonly retry: () => void;
}

export interface UseSideBackgroundInput {
  readonly productId: string;
  /** The persisted Side id, or `null` when there is nothing to address. */
  readonly sideId: string | null;
  /**
   * False when the draft's background no longer matches what the server has
   * persisted for this Side, or when there is no Side to fetch. A disabled
   * query is what keeps an unsaved replacement from being represented by the
   * bytes of the background it is replacing.
   */
  readonly enabled: boolean;
}

export function useSideBackground({
  productId,
  sideId,
  enabled,
}: UseSideBackgroundInput): SideBackground {
  const active = enabled && sideId !== null;

  const query = useQuery({
    queryKey: placementQueryKeys.sideBackground(productId, sideId ?? ''),
    queryFn: ({ signal }) => fetchSideBackground({ productId, sideId: sideId ?? '', signal }),
    enabled: active,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const blob = active ? query.data : undefined;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob === undefined) {
      // Clears the handle as soon as the bytes are gone — on a Side switch this
      // runs before the new ones arrive, so nothing stale is ever on screen.
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    // Runs on Side change, on a replacement blob, and on unmount. All three are
    // the same event as far as this resource is concerned: the handle stops
    // being the one that is rendered, so it stops existing.
    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [blob]);

  return {
    objectUrl,
    isLoading: active && query.isPending,
    failure: active && query.isError ? classifyBackgroundFailure(query.error) : null,
    retry: () => {
      void query.refetch();
    },
  };
}
