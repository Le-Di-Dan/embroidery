/**
 * Feature service seam over the three `APP12-N02.B01` variant operations.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves
 * this module as a `SellabilityApiError` carrying only the normalized envelope,
 * so no raw transport error reaches React state.
 *
 * `adminProductVariantList` is the **authoring** read, and the only one this
 * screen may use. `publicProductVariant_list` is keyed by slug, refuses
 * anything but a published product, and filters out inactive variants and SKUs
 * — the exact rows the section exists to show as history. It is not exported
 * for Admin use and is not reachable from here.
 */
import {
  adminProductVariantCreate,
  adminProductVariantList,
  adminProductVariantUpdate,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminProductVariantListResponse,
  AdminProductVariantResponse,
  CreateProductVariantBody,
  UpdateProductVariantBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { SellabilityApiError } from '../model/sellability-failure';

/** Every variant of one product and every SKU under it, active and inactive. */
export async function fetchProductVariants(
  productId: string,
  signal?: AbortSignal,
): Promise<AdminProductVariantListResponse> {
  try {
    const body = await adminProductVariantList(productId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return body.data;
  } catch (error: unknown) {
    throw new SellabilityApiError(normalizeApiClientError(error));
  }
}

/**
 * Creates one variant.
 *
 * No `AbortSignal` is accepted, here or on the update below. Aborting a write
 * in flight would leave the client unable to say whether it committed, and the
 * only correct response to that is the authoritative refetch the caller already
 * performs — so the request is allowed to finish and answer for itself.
 */
export async function createProductVariant(
  productId: string,
  body: CreateProductVariantBody,
): Promise<AdminProductVariantResponse> {
  try {
    const response = await adminProductVariantCreate(productId, body, {
      instance: getBrowserApiClient(),
    });
    return response.data;
  } catch (error: unknown) {
    throw new SellabilityApiError(normalizeApiClientError(error));
  }
}

/**
 * Patches labels and the offered flag.
 *
 * This is also how a variant is deactivated and reactivated. There is no
 * delete operation on the contract, and none is simulated here: a variant
 * leaves the catalog by becoming inactive and stays visible as history.
 */
export async function updateProductVariant(
  productId: string,
  variantId: string,
  body: UpdateProductVariantBody,
): Promise<AdminProductVariantResponse> {
  try {
    const response = await adminProductVariantUpdate(productId, variantId, body, {
      instance: getBrowserApiClient(),
    });
    return response.data;
  } catch (error: unknown) {
    throw new SellabilityApiError(normalizeApiClientError(error));
  }
}
