/**
 * Feature service seam over the two `APP7-B01` SKU **definition** operations.
 *
 * They have been on the contract since APP7 with zero Admin call sites, for the
 * reason `APP12-N02.G01` documented: a SKU is created under a variant, and
 * until `APP12-N02.B01` no delivered operation could create a variant. This
 * module is the first caller either has ever had.
 *
 * Kept apart from the variant service because the two are addressed
 * differently and refuse differently. A SKU is created under
 * `products/{productId}/variants/{variantId}` and then updated at
 * `skus/{skuId}` — the owning variant is immutable and never re-sent — and the
 * SKU vocabulary (`SKU_CODE_CONFLICT`, `SKU_ORDER_ELIGIBLE_AMBIGUOUS`) is its
 * own, not more variant codes.
 *
 * Stock is deliberately absent. `skus` is the definition side only: the
 * quantity lives behind `adminSkuStock_*` at `/kho/skus/{skuId}`, which this
 * feature links to and never calls.
 */
import { adminSkuCreate, adminSkuUpdate, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminSkuResponse, CreateSkuBody, UpdateSkuBody } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { SellabilityApiError } from '../model/sellability-failure';

/**
 * Creates one SKU under a variant.
 *
 * The response carries `variantOrderEligibleSkuCount` — how many SKUs of the
 * variant are order-eligible after the write, never more than 1. It is
 * returned to the caller rather than read here, because this module reports
 * what the server said and decides nothing about it.
 */
export async function createVariantSku(
  productId: string,
  variantId: string,
  body: CreateSkuBody,
): Promise<AdminSkuResponse> {
  try {
    const response = await adminSkuCreate(productId, variantId, body, {
      instance: getBrowserApiClient(),
    });
    return response.data;
  } catch (error: unknown) {
    throw new SellabilityApiError(normalizeApiClientError(error));
  }
}

/**
 * Patches a SKU's code, price override and sellable flag.
 *
 * This is also how a SKU stops and resumes selling. There is no delete: an
 * inactive SKU stays visible as history, and the orders that referenced it stay
 * explicable.
 */
export async function updateVariantSku(
  skuId: string,
  body: UpdateSkuBody,
): Promise<AdminSkuResponse> {
  try {
    const response = await adminSkuUpdate(skuId, body, { instance: getBrowserApiClient() });
    return response.data;
  } catch (error: unknown) {
    throw new SellabilityApiError(normalizeApiClientError(error));
  }
}
