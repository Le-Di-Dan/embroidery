'use client';

/**
 * Polling one upload until it has a verdict (`APP3-S06` §11.3).
 *
 * ## What is polled, and what is never polled
 *
 * The bounded status projection, and only it. `APP3-B06C` answers one
 * indistinguishable 404 for eleven different private misses, so a Studio that
 * treated 404-then-200 on the *binary* route as a state machine would be reading
 * a refusal as progress — and would have no way at all to show a rejected
 * upload, because a rejection and a stranger's asset look identical there.
 *
 * ## Why it stops, and when
 *
 * `refetchInterval` returns `false` the moment the answer is terminal, so
 * `READY` and `REJECTED` both end the polling in the same tick that reports
 * them. `enabled` ends it for the other three cases: no asset to poll, the
 * component unmounting, and a logical replacement pointing the hook at a
 * different Asset. `retry: false` ends it for an authorization failure — a
 * Session that expired mid-upload must not be retried against on a timer.
 *
 * ## The interval
 *
 * Two seconds, which is an S06 engineering choice rather than a ruled cadence:
 * no accepted document defines a Studio polling interval. It is bounded well
 * under the 60-reads-per-minute limit even with several Session reads in flight,
 * and it is deliberately *not* called an autosave cadence — `APP3-S10` owns
 * that, and this checkpoint saves nothing.
 *
 * `gcTime: 0` for the same reason the Side background uses it: the answer is
 * `no-store` because the authorization around it can end, and retaining it after
 * nothing is watching would let a stale grant outlive the grant.
 */
import { useQuery } from '@tanstack/react-query';
import type { DesignSessionAssetStatusResponse } from '@embroidery/api-client';
import { DesignSessionAssetStatusResponseState } from '@embroidery/api-client';

import { classifyStudioFailure, type StudioFailure } from '../model/studio-failure';
import { studioQueryKeys } from '../model/studio-query-keys';
import { fetchSessionAssetStatus } from '../services/studio-session-asset.client';

/**
 * How often an unfinished upload is asked about.
 *
 * Exported so a test can assert the value rather than re-declare it, and so the
 * one place it is decided is the one place it is read.
 */
export const SESSION_ASSET_POLL_INTERVAL_MS = 2_000;

export interface SessionAssetStatusState {
  readonly status: DesignSessionAssetStatusResponse | null;
  readonly isPolling: boolean;
  readonly failure: StudioFailure | null;
  readonly retry: () => void;
}

export interface SessionAssetAddress {
  readonly sessionId: string;
  readonly assetId: string;
}

/** Whether this answer ends the wait. Both terminal states do; nothing else. */
export function isTerminalAssetState(state: string): boolean {
  return (
    state === DesignSessionAssetStatusResponseState.READY ||
    state === DesignSessionAssetStatusResponseState.REJECTED
  );
}

/**
 * `undefined` means there is nothing to poll — no upload is in flight — and the
 * query is simply not made. That is a real state rather than an error.
 */
export function useSessionAssetStatus(
  address: SessionAssetAddress | undefined,
): SessionAssetStatusState {
  const query = useQuery({
    queryKey: studioQueryKeys.sessionAssetStatus(address?.sessionId ?? '', address?.assetId ?? ''),
    queryFn: ({ signal }) => {
      if (address === undefined) throw new Error('A status read needs an upload.');
      return fetchSessionAssetStatus(address.sessionId, address.assetId, signal);
    },
    enabled: address !== undefined,
    // The whole polling rule, in one expression: keep asking only while the
    // answer is not yet a verdict.
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === undefined) return SESSION_ASSET_POLL_INTERVAL_MS;
      return isTerminalAssetState(state) ? false : SESSION_ASSET_POLL_INTERVAL_MS;
    },
    // Polling a background tab is spending a customer's read budget on an answer
    // nobody is looking at.
    refetchIntervalInBackground: false,
    /*
     * Both are `0` for a live poll and `Infinity` for one that is not running.
     *
     * Zero is right while there is an upload: the answer is `no-store` because
     * the authorization around it can end, and retaining one would let a stale
     * grant outlive the grant. But TanStack schedules a real timer for each — a
     * garbage-collection timeout the moment the entry is inactive, and a
     * staleness timeout beside it — and this query exists on every Studio mount
     * whether or not anything is uploading, because a hook cannot be called
     * conditionally. A session that never touches an image would then carry two
     * timers it has no use for, and `APP3-S02`'s "no timer on an open stage"
     * proof would be true only by accident.
     *
     * `Infinity` schedules nothing, and there is nothing to collect: a query
     * that was never enabled holds no data.
     */
    staleTime: address === undefined ? Infinity : 0,
    gcTime: address === undefined ? Infinity : 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const data = address === undefined ? undefined : query.data;
  const state = data?.state;

  return {
    status: data ?? null,
    isPolling:
      address !== undefined &&
      !query.isError &&
      (state === undefined || !isTerminalAssetState(state)),
    failure: query.isError ? classifyStudioFailure(query.error) : null,
    retry: () => {
      void query.refetch();
    },
  };
}
