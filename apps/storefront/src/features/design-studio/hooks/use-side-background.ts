'use client';

/**
 * The Session Side's background, as a renderable object URL (`APP3-S02`).
 *
 * Two resources with different owners, deliberately kept apart:
 *
 * - **the bytes are server state**, so TanStack Query owns fetching,
 *   cancellation and failure;
 * - **the object URL is a browser resource**, so an effect owns creating it
 *   and — the part that actually matters — revoking it.
 *
 * `gcTime: 0` is load-bearing rather than tidy. `APP3-B02` answers `no-store`
 * because delivery is re-authorized on every request: unpublishing the Product
 * or retiring the Side must stop it immediately, even for a caller that already
 * knows the address. Retaining the bytes in a cache after nothing renders them
 * would be the browser-side version of the thing `no-store` exists to prevent,
 * and it would let a stale grant outlive the grant itself.
 *
 * There is no `placeholderData`. Keeping the previous entry's blob while a new
 * key loads is exactly how one Side's garment appears underneath another Side's
 * design — so the absence is the stale-background defence, not an omission.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { classifyStudioFailure, type StudioFailure } from '../model/studio-failure';
import { studioQueryKeys } from '../model/studio-query-keys';
import { fetchSideBackgroundBlob } from '../services/studio-background.client';

export interface SideBackgroundState {
  /** A browser object URL, or `null` while absent, loading or failed. */
  readonly objectUrl: string | null;
  readonly isLoading: boolean;
  readonly failure: StudioFailure | null;
  readonly retry: () => void;
}

export interface SideBackgroundAddress {
  readonly productSlug: string;
  readonly sideCode: string;
}

/**
 * `undefined` means there is nothing to address — the Session snapshot carried
 * no scope — and the query is simply not made. That is a real state rather than
 * an error: `APP3-B07` returns the placement scope on bootstrap, which resolved
 * it from the slug and codes, and omits it on resume, which addresses the
 * Session by id alone.
 */
export function useSideBackground(address: SideBackgroundAddress | undefined): SideBackgroundState {
  const query = useQuery({
    queryKey: studioQueryKeys.sideBackground(address?.productSlug ?? '', address?.sideCode ?? ''),
    queryFn: ({ signal }) => {
      if (address === undefined) throw new Error('A background needs a Session scope.');
      return fetchSideBackgroundBlob(address.productSlug, address.sideCode, signal);
    },
    enabled: address !== undefined,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const blob = address === undefined ? undefined : query.data;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob === undefined) {
      // Clears the handle as soon as the bytes are gone. On a Session change
      // this runs before any new bytes arrive, so nothing stale is on screen.
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    // Runs on a Session or Side change, on a replacement blob and on unmount.
    // All three are the same event as far as this resource is concerned: the
    // handle stops being the one rendered, so it stops existing.
    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [blob]);

  if (address === undefined) {
    return { objectUrl: null, isLoading: false, failure: null, retry: () => undefined };
  }

  return {
    objectUrl,
    isLoading: query.isPending,
    failure: query.isError ? classifyStudioFailure(query.error) : null,
    retry: () => {
      void query.refetch();
    },
  };
}
