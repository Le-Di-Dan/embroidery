'use client';

/**
 * The selected Template's preview image, as a renderable object URL
 * (`APP3-B05A`).
 *
 * Two resources with different owners, deliberately kept apart:
 *
 * - **the bytes are server state**, so TanStack Query owns fetching,
 *   cancellation and failure;
 * - **the object URL is a browser resource**, so an effect owns creating it
 *   and — the part that actually matters — revoking it.
 *
 * `gcTime: 0` is load-bearing rather than tidy. B05A answers `no-store` because
 * these bytes are a private derivative served only while the Template is public
 * right now; keeping them in a cache after nothing renders them would be the
 * browser-side version of the thing `no-store` exists to prevent.
 *
 * There is no `placeholderData`. Keeping the previous entry's blob while a new
 * key loads is precisely how one Template's artwork appears under another
 * Template's name, so the absence is the stale-preview defence, not an
 * omission. The key includes the Template slug, the published version and the
 * asset id, so selecting Template B addresses a different query and a late
 * response for A can never write into it.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { classifyStudioFailure, type StudioFailure } from '../model/studio-failure';
import { studioQueryKeys } from '../model/studio-query-keys';
import type { TemplatePreviewReference } from '../model/studio-template';
import { fetchTemplatePreviewBlob } from '../services/studio-template.client';

export interface TemplatePreviewState {
  /** A browser object URL, or `null` while absent, loading or failed. */
  readonly objectUrl: string | null;
  readonly isLoading: boolean;
  readonly failure: StudioFailure | null;
  readonly retry: () => void;
}

export function useTemplatePreview(
  reference: TemplatePreviewReference | undefined,
): TemplatePreviewState {
  const query = useQuery({
    queryKey: studioQueryKeys.templateAsset(
      reference?.templateSlug ?? '',
      reference?.version ?? 0,
      reference?.assetId ?? '',
    ),
    queryFn: ({ signal }) => {
      if (reference === undefined) throw new Error('A preview needs an asset reference.');
      return fetchTemplatePreviewBlob(reference, signal);
    },
    enabled: reference !== undefined,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const blob = reference === undefined ? undefined : query.data;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob === undefined) {
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    // Runs on Template change, on Side or Area change, on a replacement blob
    // and on unmount. All four are the same event as far as this resource is
    // concerned: the handle stops being the one rendered, so it stops existing.
    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [blob]);

  if (reference === undefined) {
    return { objectUrl: null, isLoading: false, failure: null, retry: () => undefined };
  }

  return {
    objectUrl,
    isLoading: query.isPending,
    // `gone` means the asset stopped being deliverable — unpublished, a newer
    // version published, the placement withdrawn. Nothing retries it blindly.
    failure: query.isError ? classifyStudioFailure(query.error) : null,
    retry: () => {
      void query.refetch();
    },
  };
}
