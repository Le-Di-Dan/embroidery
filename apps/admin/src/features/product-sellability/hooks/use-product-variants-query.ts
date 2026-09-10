'use client';

/**
 * The authoring list for one product.
 *
 * `staleTime: 0` because the section is the operator's evidence that the
 * product can be bought, and a cached answer here is the one thing that must
 * never be stale: every mutation on the screen changes it, and the confirmation
 * dialogs state arithmetic ("0 phiên bản đang hoạt động") computed from it.
 *
 * `retry: false` for the reason the product detail query uses it — a 404 must
 * surface immediately rather than after three silent attempts, and no failure
 * this read produces is the kind a blind retry repairs.
 *
 * No polling. The section refetches on the events that can change the answer (a
 * settled mutation, an explicit retry, arriving on the route); a timer would
 * spend requests to discover nothing on a screen the operator is reading.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AdminProductVariantListResponse } from '@embroidery/api-client';

import { sellabilityKeys } from '../model/sellability-keys';
import { fetchProductVariants } from '../services/product-variant.service';

export function useProductVariantsQuery(
  productId: string,
): UseQueryResult<AdminProductVariantListResponse, Error> {
  return useQuery({
    queryKey: sellabilityKeys.variants(productId),
    queryFn: ({ signal }) => fetchProductVariants(productId, signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
