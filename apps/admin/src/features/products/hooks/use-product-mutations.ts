'use client';

/**
 * The two draft mutations and their cache reconciliation.
 *
 * Neither mutation is optimistic. A product save can be rejected by the server
 * for a reason the client cannot predict — a stale concurrency token above all
 * — so writing the new values into the cache before the response arrives would
 * show the operator a state that never existed. The authoritative response is
 * what lands in the cache, and nothing else.
 *
 * After a successful write the detail cache is *set* from the response (so the
 * screen and its concurrency token are exactly what the server returned) and
 * the list root is invalidated rather than rewritten: a summary is not a
 * detail, and re-deriving one from the other would be a guess. Invalidating the
 * `list` root marks every filtered page stale without discarding the pages
 * themselves, so the operator's accumulated continuation survives.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { productQueryKeys } from '../model/product-query-keys';
import type {
  ProductCreateRequestBody,
  ProductUpdateRequestBody,
} from '../model/product-form-values';
import { createProductDraft, updateProductDraft } from '../services/product-draft.service';

export type ProductCreateMutation = UseMutationResult<
  AdminProductDetailResponse,
  Error,
  ProductCreateRequestBody
>;

export function useProductCreateMutation(): ProductCreateMutation {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ProductCreateRequestBody) => createProductDraft(body),
    onSuccess: (product) => {
      // Seed the detail cache so the redirect target renders the record the
      // server just returned instead of refetching what is already known.
      queryClient.setQueryData(productQueryKeys.detail(product.productId), product);
      void queryClient.invalidateQueries({ queryKey: productQueryKeys.lists() });
    },
    retry: false,
  });
}

export interface ProductUpdateInput {
  readonly productId: string;
  readonly body: ProductUpdateRequestBody;
}

export type ProductUpdateMutation = UseMutationResult<
  AdminProductDetailResponse,
  Error,
  ProductUpdateInput
>;

export function useProductUpdateMutation(): ProductUpdateMutation {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, body }: ProductUpdateInput) => updateProductDraft(productId, body),
    onSuccess: (product) => {
      queryClient.setQueryData(productQueryKeys.detail(product.productId), product);
      void queryClient.invalidateQueries({ queryKey: productQueryKeys.lists() });
    },
    // A retry would re-send the same `expectedUpdatedAt`. After a conflict that
    // token is known-stale, so an automatic retry could only fail again — or,
    // worse, succeed against a window the operator never saw.
    retry: false,
  });
}
