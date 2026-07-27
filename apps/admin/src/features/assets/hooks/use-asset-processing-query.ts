'use client';

/**
 * Post-upload processing reconciliation.
 *
 * Inspection runs in the worker, which reports no percentage and exposes no
 * push channel, so the only truthful way to learn the outcome is to re-read the
 * authoritative B01 detail resource. This polls that one resource for one
 * `assetId` — never the object store, never the database, and never a socket.
 *
 * The poll stops the moment the status is terminal or uninterpretable, and
 * `retry: false` means an auth failure or an outage ends it immediately rather
 * than hammering a failing dependency.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AdminAssetDetailResponse } from '@embroidery/api-client';

import { fetchAssetDetail } from '../services/asset-catalog.service';
import { assetQueryKeys } from '../model/asset-query-keys';
import { isReconciliationPending, parseAssetStatus } from '../model/asset-status';

/** The single processing poll interval for this capability. */
export const ASSET_PROCESSING_POLL_INTERVAL_MS = 3000;

/** Disabled entirely when `assetId` is `null` — no upload is reconciling. */
export function useAssetProcessingQuery(
  assetId: string | null,
): UseQueryResult<AdminAssetDetailResponse, Error> {
  return useQuery({
    queryKey: assetQueryKeys.detail(assetId ?? ''),
    queryFn: ({ signal }) => fetchAssetDetail(assetId as string, signal),
    enabled: assetId !== null,
    retry: false,
    refetchOnWindowFocus: false,
    // Nothing else reads this entry, so it is dropped as soon as the screen
    // stops observing it — a finished reconciliation leaves no cached asset.
    gcTime: 0,
    refetchInterval: (query) => {
      const current = query.state.data;
      if (current === undefined) {
        return ASSET_PROCESSING_POLL_INTERVAL_MS;
      }
      return isReconciliationPending(parseAssetStatus(current.status))
        ? ASSET_PROCESSING_POLL_INTERVAL_MS
        : false;
    },
  });
}
