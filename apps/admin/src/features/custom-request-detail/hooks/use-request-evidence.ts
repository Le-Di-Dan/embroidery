'use client';

/**
 * One private evidence image, as a renderable object URL.
 *
 * Two concerns, deliberately kept apart:
 *
 * - **the bytes are server state**, so TanStack Query owns fetching, caching,
 *   cancellation and failure;
 * - **the object URL is a browser resource**, so an effect owns creating it and
 *   — the part that actually matters — revoking it.
 *
 * ### `gcTime: 0` is the load-bearing setting
 *
 * `APP5-B06` marks these responses uncacheable: the bytes are immutable but the
 * authorisation around them is not, and they are a customer's private
 * photographs. Retaining them in a query cache after nothing is rendering them
 * would keep protected media alive in memory long after the operator navigated
 * away — the browser-side version of the thing `no-store` exists to prevent.
 * Dropping the entry the moment it is unobserved also means re-opening the
 * request re-authorizes the image against the server rather than trusting a
 * snapshot taken while the session was still valid.
 *
 * ### The object URL never outlives what renders it
 *
 * The effect's cleanup runs on a replacement blob, on the asset becoming
 * unavailable and on unmount — all three are the same event as far as this
 * resource is concerned: the handle stops being the one on screen, so it stops
 * existing. The handle is never written to local or session storage, never put
 * in a route or query parameter, never logged and never held in module-global
 * state; it lives in this hook's own `useState` and dies with it.
 *
 * One hook instance owns exactly one image. Ownership is per-asset on purpose:
 * a shared registry keyed by asset id would have to decide when the *last*
 * renderer let go, and getting that wrong leaks a handle to private bytes.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  classifyEvidenceFailure,
  type EvidenceFailure,
} from '../model/custom-request-detail-failure';
import { customRequestDetailKeys } from '../model/custom-request-detail-keys';
import { fetchRequestEvidence } from '../services/custom-request-detail.service';

export interface RequestEvidence {
  /** A browser object URL, or `null` while loading, absent or failed. */
  readonly objectUrl: string | null;
  readonly isLoading: boolean;
  readonly failure: EvidenceFailure | null;
  /** One manual attempt. There is no automatic retry on this path. */
  readonly retry: () => void;
}

export interface UseRequestEvidenceInput {
  readonly requestId: string;
  readonly assetId: string;
  /**
   * False for an asset this screen must not request — an unrecognised role, or
   * a tombstoned file whose association is still listed. A disabled query is
   * what keeps the screen from issuing a call it knows will be refused.
   */
  readonly enabled: boolean;
}

export function useRequestEvidence({
  requestId,
  assetId,
  enabled,
}: UseRequestEvidenceInput): RequestEvidence {
  const query = useQuery({
    queryKey: customRequestDetailKeys.evidence(requestId, assetId),
    queryFn: ({ signal }) => fetchRequestEvidence({ requestId, assetId, signal }),
    enabled,
    staleTime: 0,
    gcTime: 0,
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
    failure: enabled && query.isError ? classifyEvidenceFailure(query.error) : null,
    retry: () => {
      void query.refetch();
    },
  };
}
