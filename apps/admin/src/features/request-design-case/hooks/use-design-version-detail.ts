'use client';

/**
 * One exact version's detail — document, decisions and approval evidence
 * (`APP6-A02` §5, §14, §15, §22).
 *
 * Keyed by request **and** version, because the read returns the exact version
 * named by the path and never substitutes the current one. A key carrying only
 * the version id would let one request's cache entry answer for another's.
 *
 * `gcTime: 0`, because the response carries a customer's Design Document and
 * their own words from a review decision behind a `no-store` header. Dropping
 * the entry the moment nothing observes it also means re-selecting a version
 * re-authorizes it against the server rather than trusting a snapshot taken
 * while the session was still valid.
 *
 * The hook fetches only when a version is actually selected. Before that there
 * is nothing to read, and a disabled query is what keeps the screen from issuing
 * a call for a version that does not exist yet.
 */
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { DesignVersionDetailResponse } from '@embroidery/api-client';

import { requestDesignCaseKeys } from '../model/request-design-case-keys';
import { fetchDesignVersionDetail } from '../services/request-design-case.service';

export function useDesignVersionDetailQuery(
  requestId: string,
  versionId: string | null,
): UseQueryResult<DesignVersionDetailResponse, unknown> {
  return useQuery({
    // The non-null assertion is safe because `enabled` gates on the same value;
    // TanStack never invokes `queryFn` for a disabled query.
    queryKey: requestDesignCaseKeys.versionDetail(requestId, versionId ?? 'none'),
    queryFn: ({ signal }) =>
      fetchDesignVersionDetail({ requestId, versionId: versionId as string, signal }),
    enabled: versionId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
