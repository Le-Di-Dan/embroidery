'use client';

/**
 * The canonical detail read (`APP5-B04`).
 *
 * Everything the screen renders comes from here — the status, the subject, the
 * quantities, the transition history and the notes. After a successful mutation
 * this query is re-read and the *persisted* result is what appears; the
 * mutation receipts are never projected into the cache.
 *
 * `staleTime` is short for the same reason the queue's is: another operator may
 * be moderating the same request, and a stale detail is one that offers actions
 * against a state the request has already left. It is not zero, so opening and
 * closing a dialog does not re-request the page.
 *
 * No automatic retry, no polling and no focus refetch. A failed read is reported
 * with an explicit retry the operator triggers, never a silent loop against a
 * private Admin endpoint.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AdminCustomRequestDetailResponse } from '@embroidery/api-client';

import { customRequestDetailKeys } from '../model/custom-request-detail-keys';
import { fetchCustomRequestDetail } from '../services/custom-request-detail.service';

export const CUSTOM_REQUEST_DETAIL_STALE_TIME_MS = 15_000;

export type CustomRequestDetailQueryResult = UseQueryResult<
  AdminCustomRequestDetailResponse,
  Error
>;

export function useCustomRequestDetailQuery(requestId: string): CustomRequestDetailQueryResult {
  return useQuery({
    queryKey: customRequestDetailKeys.detail(requestId),
    queryFn: ({ signal }) => fetchCustomRequestDetail({ requestId, signal }),
    staleTime: CUSTOM_REQUEST_DETAIL_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
