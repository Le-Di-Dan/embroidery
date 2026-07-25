'use client';

import { type CurrentStaffResponse } from '@embroidery/api-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchCurrentStaff } from '../services/staff-self.service';
import {
  classifySessionError,
  STAFF_SELF_QUERY_KEY,
  STAFF_SELF_STALE_TIME_MS,
} from '../model/session-expiry';

/**
 * Handwritten TanStack query for the current-staff identity. The protected
 * layout resolved the session server-side, so the query is seeded with that
 * identity via `initialData` and a positive `staleTime`: it does NOT refetch on
 * mount (exactly one initial backend call per navigation), yet a later
 * window-focus or reconnect still re-validates the session.
 *
 * The query function returns only the safe public identity and, on failure,
 * throws a typed shell error (401 → expired, otherwise → transient) so the
 * shell can react without ever seeing a raw Axios error. Retries are disabled so
 * a single 401 surfaces immediately as an expiry.
 */
export function useCurrentStaffQuery(
  initialStaff: CurrentStaffResponse,
): UseQueryResult<CurrentStaffResponse, Error> {
  return useQuery<CurrentStaffResponse, Error>({
    queryKey: STAFF_SELF_QUERY_KEY,
    queryFn: async () => {
      try {
        return await fetchCurrentStaff();
      } catch (error: unknown) {
        throw classifySessionError(error);
      }
    },
    initialData: initialStaff,
    staleTime: STAFF_SELF_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
  });
}
