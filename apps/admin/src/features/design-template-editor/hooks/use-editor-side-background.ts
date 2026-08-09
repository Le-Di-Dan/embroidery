'use client';

/**
 * The scoped Side's authorized background, as a renderable object URL.
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
 * after nothing is rendering them would keep protected media alive in memory
 * long after the operator navigated away, which is the browser-side version of
 * the thing `no-store` exists to prevent.
 *
 * There is no `placeholderData`. Keeping the previous entry's data while a new
 * key loads is exactly how one Side's artwork would appear beneath another
 * Side's document — so the absence is load-bearing, not an omission.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { designTemplateEditorKeys } from '../model/design-template-editor-keys';
import { classifyBackgroundFailure, type BackgroundFailure } from '../model/editor-failure';
import { fetchSideBackground } from '../services/template-placement.service';

export interface EditorSideBackground {
  /** A browser object URL, or `null` while absent, loading or failed. */
  readonly objectUrl: string | null;
  readonly isLoading: boolean;
  readonly failure: BackgroundFailure | null;
  readonly retry: () => void;
}

export interface UseEditorSideBackgroundInput {
  readonly productId: string | null;
  readonly sideId: string | null;
}

export function useEditorSideBackground({
  productId,
  sideId,
}: UseEditorSideBackgroundInput): EditorSideBackground {
  const active = productId !== null && sideId !== null;

  const query = useQuery({
    queryKey: designTemplateEditorKeys.sideBackground(productId ?? '', sideId ?? ''),
    queryFn: ({ signal }) => fetchSideBackground(productId ?? '', sideId ?? '', signal),
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
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    // Runs on scope change, on a replacement blob, and on unmount. All three are
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
