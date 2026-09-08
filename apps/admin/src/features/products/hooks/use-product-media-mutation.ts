'use client';

/**
 * The media-only save, and its cache reconciliation.
 *
 * Not optimistic, for the reason `use-product-mutations` records and one more
 * of its own: `APP12-M01.B2` refuses a set **whole**, so a client that painted
 * the new order before the response would show an operator a gallery the
 * product never had — and on a PUBLISHED product that gallery is what customers
 * are being shown right now. The authoritative response is what lands in the
 * cache, and nothing else.
 *
 * One request commits the whole selection. There is deliberately no mutation
 * per reorder, per removal or per set-primary: the contract has no such
 * operations, and issuing twenty writes to express one intent would make a
 * half-applied gallery reachable.
 *
 * The detail cache is *set* from the response — which is what refreshes both
 * the rendered order and the `updatedAt` a subsequent save must echo — and the
 * list root is invalidated rather than rewritten, because a summary carries a
 * primary image and re-deriving one from a detail would be a guess.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { productQueryKeys } from '../model/product-query-keys';
import {
  replaceProductMedia,
  type ProductMediaReplaceBody,
} from '../services/product-media.service';

export interface ProductMediaReplaceInput {
  readonly productId: string;
  readonly body: ProductMediaReplaceBody;
}

export type ProductMediaMutation = UseMutationResult<
  AdminProductDetailResponse,
  Error,
  ProductMediaReplaceInput
>;

export function useProductMediaMutation(): ProductMediaMutation {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, body }: ProductMediaReplaceInput) =>
      replaceProductMedia(productId, body),
    onSuccess: (product) => {
      queryClient.setQueryData(productQueryKeys.detail(product.productId), product);
      void queryClient.invalidateQueries({ queryKey: productQueryKeys.lists() });
    },
    // A retry would re-send the same `expectedUpdatedAt`, which after a conflict
    // is known-stale: it could only fail again, or succeed against a window the
    // operator never saw.
    retry: false,
  });
}
