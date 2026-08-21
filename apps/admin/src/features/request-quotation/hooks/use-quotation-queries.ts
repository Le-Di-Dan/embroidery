'use client';

/**
 * The three reads behind the workbench, and the bootstrap order they impose
 * (`APP6-A01` §7).
 *
 * ```text
 * route requestId
 *   → request context (APP5-B04)      → quotationId
 *       null      → the approved empty state
 *       non-null  → version history (APP6-B02) → the selected version's detail
 * ```
 *
 * The history query is **enabled only once a quotation id exists**. That is what
 * keeps the three states honestly apart: while the context is still loading
 * there is no history request in flight to fail, so a pending bootstrap can
 * never be mistaken for an empty quotation, and a failed history read is
 * reported as a failure rather than as "no quotation yet".
 *
 * Quotation existence is never inferred from the request status. A request may
 * hold a DRAFT quotation while still `UNDER_REVIEW` — that is the ordinary case
 * the moment before a send — so the locator is the only thing consulted.
 *
 * No automatic retry, no polling, no focus refetch: these are private Admin
 * endpoints, and a failed read is reported with an explicit retry the operator
 * triggers.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type {
  AdminCustomRequestDetailResponse,
  AdminQuotationVersionDetailResponse,
  AdminQuotationVersionHistoryResponse,
} from '@embroidery/api-client';

import { requestQuotationKeys } from '../model/request-quotation-keys';
import {
  fetchRequestContext,
  fetchVersionDetail,
  fetchVersionHistory,
} from '../services/request-quotation.service';

/**
 * Short, for the reason A02's is short: another operator may be quoting the same
 * request, and a stale screen is one that offers a send against a version that
 * has already gone. Not zero, so opening a dialog does not re-request the page.
 */
export const QUOTATION_STALE_TIME_MS = 15_000;

export function useRequestContextQuery(
  requestId: string,
): UseQueryResult<AdminCustomRequestDetailResponse, Error> {
  return useQuery({
    queryKey: requestQuotationKeys.context(requestId),
    queryFn: ({ signal }) => fetchRequestContext({ requestId, signal }),
    staleTime: QUOTATION_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useVersionHistoryQuery(
  quotationId: string | null,
): UseQueryResult<AdminQuotationVersionHistoryResponse, Error> {
  return useQuery({
    // The key is only ever built for a real id; the placeholder below is never
    // reached because `enabled` is false in exactly that case.
    queryKey: requestQuotationKeys.history(quotationId ?? 'none'),
    queryFn: ({ signal }) => fetchVersionHistory({ quotationId: quotationId as string, signal }),
    enabled: quotationId !== null,
    staleTime: QUOTATION_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * One exact version's lines.
 *
 * Fetched for the **selected** version only — never eagerly for every row in the
 * history, which would be one request per version to render a list that already
 * carries its own totals.
 */
export function useVersionDetailQuery(
  quotationId: string | null,
  versionId: string | null,
): UseQueryResult<AdminQuotationVersionDetailResponse, Error> {
  const enabled = quotationId !== null && versionId !== null;
  return useQuery({
    queryKey: requestQuotationKeys.versionDetail(quotationId ?? 'none', versionId ?? 'none'),
    queryFn: ({ signal }) =>
      fetchVersionDetail({
        quotationId: quotationId as string,
        versionId: versionId as string,
        signal,
      }),
    enabled,
    staleTime: QUOTATION_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
