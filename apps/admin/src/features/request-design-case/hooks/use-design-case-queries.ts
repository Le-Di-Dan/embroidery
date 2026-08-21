'use client';

/**
 * The three reads the design-case workbench bootstraps from (`APP6-A02` §13,
 * §14, §24).
 *
 * TanStack Query owns fetching, caching, cancellation and failure. There is no
 * second server-state store, and nothing here duplicates a server fact into
 * Zustand or React state.
 *
 * ### Four failure states that never collapse into one
 *
 * `APP6-A02` §24 requires the screen to keep these apart, so the hooks return
 * them apart:
 *
 * - the **request** failing to load is the screen's own failure;
 * - the submitted source coming back `null` is an **honest absence** and a
 *   successful read — it is exposed as `absent`, never as a failure, because
 *   turning it into a network error is the specific defect the brief names;
 * - the submitted-source read *failing* is separate again;
 * - an **empty version history** is a fact, not a failed list. `versions: []`
 *   from a successful read and a failed read are different states and are
 *   reported as such.
 *
 * ### No automatic mutation retry, and no retry on a decided refusal
 *
 * `retry: false` everywhere. A read that was refused because the request does
 * not exist, or because the operator may not see it, will keep being refused;
 * retrying it in a loop turns one refusal into several and tells the operator
 * nothing new. Failed reads offer an explicit control instead.
 */
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  AdminCustomRequestDetailResponse,
  AdminSubmittedDesignSourceResponse,
  DesignVersionListResponse,
} from '@embroidery/api-client';

import { requestDesignCaseKeys } from '../model/request-design-case-keys';
import {
  fetchDesignVersions,
  fetchRequestContext,
  fetchSubmittedSource,
} from '../services/request-design-case.service';

/**
 * The request context read.
 *
 * `staleTime: 0`, because this is the read the gate and the send both reconcile
 * against: it carries the request status `APP6-B09` may have projected inside
 * the send transaction, and a cached copy would show the operator a status the
 * server has already moved past.
 */
export function useRequestContextQuery(
  requestId: string,
): UseQueryResult<AdminCustomRequestDetailResponse, unknown> {
  return useQuery({
    queryKey: requestDesignCaseKeys.context(requestId),
    queryFn: ({ signal }) => fetchRequestContext({ requestId, signal }),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * The submitted Catalog source, resolved into three distinct outcomes.
 *
 * `gcTime: 0` for the same reason `APP5-A02`'s evidence hook uses it: this is a
 * customer's artwork behind a `no-store` response, and retaining it in a query
 * cache after nothing renders it keeps private design data alive in memory long
 * after the operator navigated away.
 */
export interface SubmittedSourceState {
  readonly source: AdminSubmittedDesignSourceResponse | null;
  /** True when the server answered successfully with no source. Not a failure. */
  readonly absent: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly retry: () => void;
}

export function useSubmittedSourceQuery(requestId: string, enabled: boolean): SubmittedSourceState {
  const query = useQuery({
    queryKey: requestDesignCaseKeys.submittedSource(requestId),
    queryFn: ({ signal }) => fetchSubmittedSource({ requestId, signal }),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const source = query.data?.submittedDesign ?? null;
  return {
    source,
    // Absence is read from a **successful** response, so a failed read can never
    // be mistaken for "there is no source".
    absent: enabled && query.isSuccess && source === null,
    isLoading: enabled && query.isPending,
    isError: enabled && query.isError,
    error: query.error,
    retry: () => {
      void query.refetch();
    },
  };
}

/**
 * The version history.
 *
 * The list is the history authority and its order is the server's; nothing here
 * sorts, filters or hides a row. Superseded and void versions stay visible — a
 * history that hid them could not explain how the current version was arrived
 * at.
 */
export function useDesignVersionsQuery(
  requestId: string,
  enabled: boolean,
): UseQueryResult<DesignVersionListResponse, unknown> {
  return useQuery({
    queryKey: requestDesignCaseKeys.versions(requestId),
    queryFn: ({ signal }) => fetchDesignVersions({ requestId, signal }),
    enabled,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
