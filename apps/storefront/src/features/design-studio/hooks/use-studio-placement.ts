'use client';

import { useQuery } from '@tanstack/react-query';

import type { PublicProductPlacementResponse } from '@embroidery/api-client';

import { studioQueryKeys } from '../model/studio-query-keys';
import { fetchStudioPlacement } from '../services/studio-placement.client';

export interface StudioPlacementState {
  readonly placement: PublicProductPlacementResponse | undefined;
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly retry: () => void;
}

/**
 * The Product's public placement manifest (`APP3-B01`).
 *
 * `staleTime: 0` and no window-focus refetch: placement eligibility is re-read
 * by the API on every request precisely because nothing in this system
 * invalidates a cache, so a client-side freshness window would be the one place
 * a retired Side could survive. Nothing retries automatically either — a
 * failure the visitor did not ask to repeat is a request they did not make.
 */
export function useStudioPlacement(slug: string): StudioPlacementState {
  const query = useQuery({
    queryKey: studioQueryKeys.placement(slug),
    queryFn: ({ signal }) => fetchStudioPlacement(slug, signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    placement: query.data,
    isLoading: query.isPending,
    hasError: query.isError,
    retry: () => {
      void query.refetch();
    },
  };
}
