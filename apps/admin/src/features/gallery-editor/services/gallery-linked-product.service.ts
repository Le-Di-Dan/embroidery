/**
 * Feature service seam over the two **existing** Admin product reads the linked
 * product field needs.
 *
 * No second product API is created here, and no product write is reachable: the
 * editor picks from the catalog the Admin already publishes and stores an id.
 * `adminProduct_list` is the picker's collection and `adminProduct_detail`
 * resolves the one already-linked product's name.
 *
 * ## Why one detail read is not an N+1
 *
 * `APP11-A01`'s list renders a linked/unlinked signal precisely because
 * resolving a label per row would open one catalog read per row. Here there is
 * exactly one linked product on one screen, and its name is the only thing that
 * can honestly stand in for it — the alternative is rendering a UUID at an
 * operator, which is an internal identifier presented as if it meant something.
 *
 * ## Draft products are offered on purpose
 *
 * The list is not filtered to `PUBLISHED`. The gallery contract validates a
 * linked product as *Admin-visible*, not as publicly visible, so refusing to
 * offer a draft would be this screen enforcing a rule the server does not have
 * — and an operator preparing a gallery entry alongside an unreleased product
 * is the ordinary case, not an edge one.
 */
import {
  adminProductDetail,
  adminProductList,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AdminProductDetailResponse, AdminProductListResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { GalleryEditorApiError } from '../model/gallery-editor-failure';
import { GALLERY_PRODUCT_PAGE_SIZE } from '../model/gallery-editor-keys';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

export interface FetchLinkableProductPageInput {
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** One keyset page of products, in the catalog's own order. */
export async function fetchLinkableProductPage({
  cursor,
  signal,
}: FetchLinkableProductPageInput = {}): Promise<AdminProductListResponse> {
  try {
    const response = await adminProductList(
      { limit: GALLERY_PRODUCT_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
      requestOptions(signal),
    );
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}

/** The linked product's own record, for its name. */
export async function fetchLinkedProduct(
  productId: string,
  signal?: AbortSignal,
): Promise<AdminProductDetailResponse> {
  try {
    const response = await adminProductDetail(productId, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}
