'use client';

/**
 * The linked product's name, and the picker's collection.
 *
 * Two queries with different shapes and different lifetimes, kept in one module
 * because they answer one question between them: which product is linked, and
 * which products could be.
 *
 * The label query is `enabled` only when an id is actually linked, so an entry
 * with no product opens no catalog read at all. The picker query is `enabled`
 * only while its dialog is open.
 */
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { AdminProductDetailResponse, AdminProductListResponse } from '@embroidery/api-client';

import { galleryEditorKeys } from '../model/gallery-editor-keys';
import {
  fetchLinkableProductPage,
  fetchLinkedProduct,
} from '../services/gallery-linked-product.service';

/** A product's name changes rarely; a longer window avoids a read per visit. */
export const LINKED_PRODUCT_STALE_TIME_MS = 60_000;
export const LINKABLE_PRODUCT_STALE_TIME_MS = 15_000;

export type LinkedProductQueryResult = UseQueryResult<AdminProductDetailResponse, Error>;

export function useLinkedProductQuery(productId: string | undefined): LinkedProductQueryResult {
  const enabled = productId !== undefined && productId !== '';
  return useQuery({
    queryKey: galleryEditorKeys.product(productId ?? ''),
    queryFn: ({ signal }) => fetchLinkedProduct(productId as string, signal),
    enabled,
    staleTime: LINKED_PRODUCT_STALE_TIME_MS,
    // A name that cannot be read is a label problem, not an entry problem: the
    // field says so and the editor stays fully usable, so there is nothing for
    // a retry loop to rescue.
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export type LinkableProductQueryResult = UseInfiniteQueryResult<
  InfiniteData<AdminProductListResponse, string | undefined>,
  Error
>;

/** The cursor for the next page, or `undefined` when the catalog is exhausted. */
function resolveProductCursor(page: AdminProductListResponse | undefined): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}

export function useLinkableProductQuery(enabled: boolean): LinkableProductQueryResult {
  return useInfiniteQuery({
    queryKey: galleryEditorKeys.products(),
    queryFn: ({ pageParam, signal }) => fetchLinkableProductPage({ cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: AdminProductListResponse) =>
      resolveProductCursor(lastPage) ?? null,
    staleTime: LINKABLE_PRODUCT_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
    enabled,
  });
}

/**
 * Flattens accumulated pages in server order, first occurrence winning.
 *
 * A concurrent create can shift the keyset window and put one product on two
 * pages; offering it twice would misstate the catalog, and re-sorting would
 * move options under the operator's cursor.
 */
export function flattenProductPages(
  pages: readonly AdminProductListResponse[],
): readonly { readonly productId: string; readonly name: string }[] {
  const seen = new Set<string>();
  const items: { productId: string; name: string }[] = [];
  for (const page of pages) {
    for (const product of page.items) {
      if (seen.has(product.productId)) {
        continue;
      }
      seen.add(product.productId);
      items.push({ productId: product.productId, name: product.name });
    }
  }
  return items;
}
