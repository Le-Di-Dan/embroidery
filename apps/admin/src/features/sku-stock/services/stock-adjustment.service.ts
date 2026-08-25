/**
 * The one `APP8-B01` **write** this workspace performs: `adminSkuStock_adjust`.
 *
 * It is alone in its own module on purpose. This is the only operation in APP8
 * that moves `quantityOnHand`, the only way stock ever enters the system, and
 * it carries no idempotency key — so a resend is a *second* adjustment, never a
 * retry of the first. Nothing above may re-issue it automatically, and keeping
 * it out of the read module is what makes that visible.
 *
 * The body is built by `validateStockAdjustment` and consists of exactly
 * `delta` and `reason`. This module adds no field, normalises no value and
 * clamps no delta: the server owns the outcome, including the refusal.
 */
import { adminSkuStockAdjust, normalizeApiClientError } from '@embroidery/api-client';
import type { AdjustSkuStockBody, AdminSkuStockResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { SkuStockApiError } from '../model/sku-stock-failure';

export interface ApplyStockAdjustmentInput {
  readonly skuId: string;
  readonly body: AdjustSkuStockBody;
}

/**
 * Applies one audited adjustment and resolves with the **server's** stock
 * record afterwards.
 *
 * The response is the authoritative post-write truth, so the screen never has
 * to add the delta to anything: the "40 → 60" the success state reports is the
 * snapshot taken before the write beside the record the server just returned.
 */
export async function applyStockAdjustment({
  skuId,
  body,
}: ApplyStockAdjustmentInput): Promise<AdminSkuStockResponse> {
  try {
    const response = await adminSkuStockAdjust(skuId, body, {
      instance: getBrowserApiClient(),
    });
    return response.data;
  } catch (error: unknown) {
    throw new SkuStockApiError(normalizeApiClientError(error));
  }
}
