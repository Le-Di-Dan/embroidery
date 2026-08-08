'use client';

/**
 * The authoritative placement snapshot for the authoring screen.
 *
 * `retry: false` is deliberate: a 404 must surface as "not found" immediately
 * rather than after three silent attempts, and a read never produces the
 * stale-token conflict a retry could repair.
 *
 * `staleTime: 0` is equally deliberate. The snapshot carries the concurrency
 * token, so a refetch is how the screen recovers from a conflict — serving a
 * cached snapshot after the operator asked to reload would hand back the same
 * stale token that just failed.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { placementQueryKeys } from '../model/placement-query-keys';
import type { PlacementModel } from '../model/placement-model';
import { fetchPlacement } from '../services/product-placement.service';

export function usePlacementQuery(productId: string): UseQueryResult<PlacementModel, Error> {
  return useQuery({
    queryKey: placementQueryKeys.detail(productId),
    queryFn: ({ signal }) => fetchPlacement(productId, signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
