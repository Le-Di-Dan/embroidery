'use client';

/**
 * The authoritative merge case, and the single re-read every decision ends in.
 *
 * ### The case id is the whole input
 *
 * Nothing here depends on state from the selection screen, which is what makes a
 * direct visit and a browser refresh of `/support/customer-access/merge/{caseId}`
 * work identically to arriving from an open. Survivor, loser, reason, status and
 * the preview all come from the server.
 *
 * ### `refetch`, not `invalidateQueries`
 *
 * Execute and reject each settle by awaiting `refetch()`, which is **one**
 * network read whose result the caller can also classify against. Invalidating
 * would schedule a read this hook cannot await and — because this is the only
 * observer of the key — would produce exactly the same single request a beat
 * later. Both would be one re-read; only this one can be sequenced.
 *
 * ### `staleTime: 0`, no polling
 *
 * A merge case is decided by whoever acts on it next, and this screen offers
 * irreversible actions against what it shows, so a cached answer is the wrong
 * default. It is still not polled: nothing here races a background worker, and a
 * screen that re-asked every few seconds would move an operator's focus while
 * they read a confirmation.
 */
import { useQuery } from '@tanstack/react-query';
import type { AdminCustomerMergeCaseResponse } from '@embroidery/api-client';

import { isCustomerAccessApiError } from '../../customer-access-support';
import { customerMergeKeys } from '../model/customer-merge-keys';
import { fetchMergeCase } from '../services/customer-merge.service';

const HTTP_NOT_FOUND = 404;

export interface MergeCaseState {
  readonly mergeCase: AdminCustomerMergeCaseResponse | undefined;
  readonly loading: boolean;
  /** The read failed for a reason other than "no such case". */
  readonly failed: boolean;
  /** The server answered 404: the case does not exist. A different screen. */
  readonly missing: boolean;
  /**
   * Re-reads and resolves with what the server now says, or `undefined` when
   * the re-read itself failed.
   */
  readonly refetch: () => Promise<AdminCustomerMergeCaseResponse | undefined>;
}

export function useMergeCase(mergeCaseId: string): MergeCaseState {
  const query = useQuery({
    queryKey: customerMergeKeys.mergeCase(mergeCaseId),
    queryFn: ({ signal }) => fetchMergeCase(mergeCaseId, signal),
    staleTime: 0,
    // A 404 is an answer, not a transient failure: the case does not exist and
    // asking twice more cannot change that.
    retry: false,
  });

  const missing =
    query.isError &&
    isCustomerAccessApiError(query.error) &&
    query.error.normalized.httpStatus === HTTP_NOT_FOUND;

  return {
    mergeCase: query.data,
    loading: query.isPending,
    failed: query.isError && !missing,
    missing,
    refetch: async () => {
      const result = await query.refetch();
      return result.isError ? undefined : result.data;
    },
  };
}
