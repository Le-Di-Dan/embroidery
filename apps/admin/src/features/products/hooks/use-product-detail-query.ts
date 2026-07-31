'use client';

/**
 * The authoritative product record for the edit/detail screen.
 *
 * `retry: false` is deliberate: a 404 must surface as "not found" immediately
 * rather than after three silent attempts, and a stale-token conflict is never
 * produced by a read, so there is nothing a retry would repair.
 *
 * `staleTime: 0` is equally deliberate. The record carries the concurrency
 * token, so a refetch is how the screen recovers from a conflict — serving a
 * cached record after the operator asked to reload would hand back the same
 * stale token that just failed.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { productQueryKeys } from '../model/product-query-keys';
import { fetchProductDetail } from '../services/product-draft.service';

export function useProductDetailQuery(
  productId: string,
): UseQueryResult<AdminProductDetailResponse, Error> {
  return useQuery({
    queryKey: productQueryKeys.detail(productId),
    queryFn: ({ signal }) => fetchProductDetail(productId, signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
