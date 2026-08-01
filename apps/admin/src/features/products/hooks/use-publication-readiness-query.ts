'use client';

/**
 * The publication readiness report for one product.
 *
 * `staleTime: 0` because the report is explicitly a moment-in-time evaluation.
 * Serving a cached verdict would be worse here than for an ordinary read: the
 * operator would be looking at a checklist describing a product that has since
 * changed, and pressing publish on it.
 *
 * `retry: false` for the same reason the detail query uses it — a 404 must
 * surface immediately rather than after three silent attempts, and no readiness
 * failure is the kind a blind retry repairs.
 *
 * No polling. The screen refetches on the events that can change the answer (a
 * refused command, an explicit retry, arriving on the route); a timer would
 * spend requests to discover nothing on a screen the operator is reading.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AdminProductPublicationReadinessResponse } from '@embroidery/api-client';

import { productQueryKeys } from '../model/product-query-keys';
import { fetchPublicationReadiness } from '../services/product-publication.service';

export function usePublicationReadinessQuery(
  productId: string,
): UseQueryResult<AdminProductPublicationReadinessResponse, Error> {
  return useQuery({
    queryKey: productQueryKeys.publicationReadiness(productId),
    queryFn: ({ signal }) => fetchPublicationReadiness(productId, signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
