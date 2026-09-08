/**
 * Feature service seam over the one `APP12-M01.B2` media operation.
 *
 * Separate from `product-draft.service` deliberately. That module owns the
 * DRAFT-only authoring operations; this one owns the single write a
 * **PUBLISHED** product accepts, and the two must not be reachable through one
 * function. Routing a published gallery through `adminProductUpdate` would be
 * refused as `PRODUCT_NOT_EDITABLE` — a correct refusal an operator cannot act
 * on — so the split is what makes the wrong call impossible to make by accident
 * rather than merely discouraged in a comment.
 *
 * The whole write model is the ordered array: `mediaAssetIds[0]` is the
 * primary, array order is display order, and an omitted id is removed. Nothing
 * is added to the body here — no role, no position, no primary flag — because
 * the contract carries none and inventing one would let a request describe a
 * selection with two primaries.
 *
 * Failures leave as `ProductApiError` carrying only the normalized envelope, so
 * no Axios instance, request config or raw server sentence reaches React state.
 */
import { adminProductMediaReplace, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { ProductApiError } from '../model/product-failure';

/** The exact `adminProductMedia_replace` body: two required fields, no more. */
export interface ProductMediaReplaceBody {
  /** The token the authoritative Product response last carried. */
  readonly expectedUpdatedAt: string;
  /** The complete intended selection. `[]` is the explicit clear, not "no change". */
  readonly mediaAssetIds: readonly string[];
}

/**
 * Replaces the whole ordered selection and returns the authoritative Product.
 *
 * The response is `AdminProductDetailResponse` — the same payload the detail
 * read returns — which is what refreshes both the rendered order and the
 * concurrency token in one step. A caller that ignored it would hold a token
 * the next save could only fail with.
 */
export async function replaceProductMedia(
  productId: string,
  body: ProductMediaReplaceBody,
  signal?: AbortSignal,
): Promise<AdminProductDetailResponse> {
  try {
    const response = await adminProductMediaReplace(
      productId,
      {
        expectedUpdatedAt: body.expectedUpdatedAt,
        // The generated type is a mutable `string[]`; the feature models the
        // selection as readonly, so the copy here is the boundary between the
        // two rather than a cast that would let the request alias form state.
        mediaAssetIds: [...body.mediaAssetIds],
      },
      {
        instance: getBrowserApiClient(),
        ...(signal === undefined ? {} : { config: { signal } }),
      },
    );
    return response.data;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}
