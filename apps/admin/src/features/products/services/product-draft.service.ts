/**
 * Feature service seam over the generated B02 draft operations.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `ProductApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * The request bodies are typed by this feature *and* by the generated tree.
 * Until `APP3-P03` the generated `CreateProductBody` and `UpdateProductBody`
 * were open index signatures — the Zod DTOs contributed no properties to the
 * artifact — so an unchecked object compiled and each call needed a cast. The
 * generated types now carry the real field set, so the create call needs no
 * cast at all and the local interfaces in `product-form-values` are checked
 * against the published contract by the compiler rather than only by tests.
 *
 * The patch call keeps one cast, and it is not a leftover: under this app's
 * `exactOptionalPropertyTypes`, `ProductUpdateRequestBody` admits an explicit
 * `undefined` for a field the generated type declares as merely optional. The
 * form legitimately sends that for an untouched field, and the server treats an
 * absent value and an explicit `undefined` alike.
 */
import {
  adminProductCreate,
  adminProductDetail,
  adminProductUpdate,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AdminProductDetailResponse, UpdateProductBody } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { ProductApiError } from '../model/product-failure';
import type {
  ProductCreateRequestBody,
  ProductUpdateRequestBody,
} from '../model/product-form-values';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

/**
 * Creates the draft with exactly the three POST-supported fields. One request:
 * price and media are not part of create and are never smuggled in behind it as
 * a follow-up PATCH.
 */
export async function createProductDraft(
  body: ProductCreateRequestBody,
  signal?: AbortSignal,
): Promise<AdminProductDetailResponse> {
  try {
    const response = await adminProductCreate(body, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}

/** The authoritative product, including the `updatedAt` concurrency token. */
export async function fetchProductDetail(
  productId: string,
  signal?: AbortSignal,
): Promise<AdminProductDetailResponse> {
  try {
    const response = await adminProductDetail(productId, requestOptions(signal));
    return response.data;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}

/**
 * Patches the draft. The caller has already reduced the body to changed fields
 * plus `expectedUpdatedAt`; this layer adds nothing, so a field absent from the
 * body is genuinely a field the operator did not change.
 */
export async function updateProductDraft(
  productId: string,
  body: ProductUpdateRequestBody,
  signal?: AbortSignal,
): Promise<AdminProductDetailResponse> {
  try {
    const response = await adminProductUpdate(
      productId,
      body as UpdateProductBody,
      requestOptions(signal),
    );
    return response.data;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}
