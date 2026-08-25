'use client';

/**
 * The one authoritative read behind the job detail, and the refresh that keeps
 * it honest after a transition.
 *
 * Keyed by `jobId` alone, because that is the only address `APP8-B03` accepts.
 *
 * `staleTime` is short. A job's state is decided under a row lock by whoever
 * commands it next, and another operator can move it at any moment; a stale
 * detail is a screen offering a command that no longer applies. It is not zero,
 * so opening and closing a confirmation dialog does not re-request the page.
 *
 * No automatic retry, no polling and no focus refetch. A failed read is reported
 * with an explicit retry the operator triggers, never a silent loop against a
 * private Admin endpoint — and `787:184` forbids automatic retry of a refused
 * command outright.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { AdminProductionJobDetailResponse } from '@embroidery/api-client';

import { productionJobKeys } from '../model/production-job-keys';
import { fetchProductionJob } from '../services/production-job.service';

export const PRODUCTION_JOB_STALE_TIME_MS = 15_000;

export type ProductionJobQueryResult = UseQueryResult<AdminProductionJobDetailResponse, Error>;

export function useProductionJobQuery(jobId: string): ProductionJobQueryResult {
  return useQuery({
    queryKey: productionJobKeys.detail(jobId),
    queryFn: ({ signal }) => fetchProductionJob({ jobId, signal }),
    staleTime: PRODUCTION_JOB_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export interface ProductionJobRefresh {
  /**
   * Re-reads this job and resolves with the record the server returned. Awaited
   * by every path that has to report truth the client no longer knows.
   */
  readonly refreshJob: () => Promise<AdminProductionJobDetailResponse | undefined>;
  /** Re-reads this job, then invalidates the production queue that lists it. */
  readonly refreshJobAndQueue: () => Promise<AdminProductionJobDetailResponse | undefined>;
}

/**
 * Re-reads whatever a transition may have changed — and nothing else.
 *
 * Two invalidations, both targeted:
 *
 * - **this job's detail**, because the command moved its LC-18 state, stamped a
 *   timestamp, appended a history row and may have terminalized reservations.
 *   The mutation's own receipt is never written into the cache as a substitute
 *   for re-reading, so nothing on screen can be a state the authoritative read
 *   has not confirmed.
 * - **the production queue root**, because a status-filtered queue's membership
 *   changed: a job that just completed no longer belongs in a `STARTED` page.
 *   The key comes from `APP8-A02`'s own factory rather than a literal spelled
 *   here, so the two features cannot drift into two cache namespaces.
 *
 * Nothing else is touched. There is no `invalidateQueries()` without a key —
 * that would re-fetch every other Admin screen's cached data for a change that
 * concerns one job — and no `queryClient.clear()` anywhere.
 */
export function useProductionJobRefresh(jobId: string): ProductionJobRefresh {
  const queryClient = useQueryClient();

  const refreshJob = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: productionJobKeys.detail(jobId) });
    return queryClient.getQueryData<AdminProductionJobDetailResponse>(
      productionJobKeys.detail(jobId),
    );
  }, [queryClient, jobId]);

  const refreshJobAndQueue = useCallback(async () => {
    const job = await refreshJob();
    await queryClient.invalidateQueries({ queryKey: productionJobKeys.queue() });
    return job;
  }, [queryClient, refreshJob]);

  return { refreshJob, refreshJobAndQueue };
}
