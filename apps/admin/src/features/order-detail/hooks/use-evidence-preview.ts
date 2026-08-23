'use client';

/**
 * One private transfer screenshot, as a renderable object URL (`742:3`).
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
 * `APP7-B06` marks these responses uncacheable: the bytes are immutable but the
 * authorisation around them is not, and they are a customer's private banking
 * screenshots. Retaining them in a query cache after nothing is rendering them
 * would keep protected media alive in memory long after the operator closed the
 * dialog — the browser-side version of the thing `no-store` exists to prevent.
 * Dropping the entry the moment it is unobserved also means re-opening an image
 * re-authorizes it against the server rather than trusting a snapshot taken
 * while the session was still valid.
 *
 * ### The object URL never outlives what renders it
 *
 * The effect's cleanup runs when the blob is replaced (the operator moved to
 * another image), when the bytes go away, and on unmount (the dialog closed, or
 * the page navigated) — all three are the same event as far as this resource is
 * concerned: the handle stops being the one on screen, so it stops existing. The
 * handle is never written to local or session storage, never put in a route or
 * query parameter, never logged and never held in module-global state; it lives
 * in this hook's own `useState` and dies with it.
 *
 * ### A 404 has a consequence a 503 does not
 *
 * `previewEligible` is a hint computed when the payment read was taken, and the
 * inspection verdict can move underneath it. So an `unavailable` failure calls
 * back to re-read the payment metadata: the list the operator is looking at may
 * now be wrong about which images are viewable. It never touches payment state —
 * opening an image is a read, and a failed read is not a reason to write
 * anything.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { classifyEvidenceFailure, type EvidenceFailure } from '../model/order-detail-failure';
import { orderDetailKeys } from '../model/order-detail-keys';
import { fetchPaymentEvidence } from '../services/order-detail.service';

export interface EvidencePreview {
  /** A browser object URL, or `null` while loading, absent or failed. */
  readonly objectUrl: string | null;
  readonly isLoading: boolean;
  readonly failure: EvidenceFailure | null;
  /** One manual attempt, offered only in the temporary band. */
  readonly retry: () => void;
}

export interface UseEvidencePreviewInput {
  readonly orderId: string;
  /**
   * The `payment_transfer_evidence` association id — the only locator
   * `APP7-B06` accepts. The underlying asset id is never published and is never
   * used here.
   */
  readonly evidenceId: string;
  /**
   * False for an image the screen must not request: anything the payment read
   * did not mark `previewEligible`. A disabled query is what keeps the screen
   * from issuing a call it already knows will be refused.
   */
  readonly enabled: boolean;
  /**
   * Called once when the server answers that the image is not available, so the
   * caller can re-read the payment metadata whose `previewEligible` is now
   * suspect. Never a reason to write payment state.
   */
  readonly onUnavailable: () => void;
}

export function useEvidencePreview({
  orderId,
  evidenceId,
  enabled,
  onUnavailable,
}: UseEvidencePreviewInput): EvidencePreview {
  const query = useQuery({
    queryKey: orderDetailKeys.evidence(orderId, evidenceId),
    queryFn: ({ signal }) => fetchPaymentEvidence({ evidenceId, signal }),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const failure = enabled && query.isError ? classifyEvidenceFailure(query.error) : null;

  useEffect(() => {
    if (failure === 'unavailable') {
      onUnavailable();
    }
  }, [failure, onUnavailable]);

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
    failure,
    retry: () => {
      void query.refetch();
    },
  };
}
