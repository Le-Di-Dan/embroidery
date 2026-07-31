/**
 * Feature service seam over the generated `adminProduct_list` operation.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `ProductApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * This is the only product operation the Admin list may call. Create, detail,
 * update and archive are not re-exported from `@embroidery/api-client`, so a
 * mutation cannot be reached from this screen even by mistake.
 */
import { adminProductList, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminProductListResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { ProductApiError } from '../model/product-failure';
import { toProductListParams, type ProductFilters } from '../model/product-filters';
import { PRODUCT_LIST_PAGE_SIZE } from '../model/product-query-keys';

export interface FetchProductPageInput {
  readonly filters: ProductFilters;
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page, newest first. There is no offset or page number: the cursor
 * is passed back exactly as the server issued it and is never parsed.
 */
export async function fetchProductPage({
  filters,
  cursor,
  signal,
}: FetchProductPageInput): Promise<AdminProductListResponse> {
  try {
    const body = await adminProductList(
      {
        limit: PRODUCT_LIST_PAGE_SIZE,
        ...toProductListParams(filters),
        ...(cursor === undefined ? {} : { cursor }),
      },
      { instance: getBrowserApiClient(), ...(signal === undefined ? {} : { config: { signal } }) },
    );
    return body.data;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}
