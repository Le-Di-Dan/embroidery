/**
 * The one Product-owned read this screen performs.
 *
 * A Template carries three ids; whether the rows behind them are still active,
 * and what they are called, is the Product's fact. The lifecycle screen reads it
 * through the operation that already publishes it (`APP3-B01`) so four of the
 * seven readiness rows can be answered instead of deferred.
 *
 * Deliberately this feature's own thin wrapper rather than an import from the
 * editor's placement service: the two gate the request on different facts and
 * report failure into different states. What they genuinely share is one
 * generated call, which is what is reused. A cross-feature import would couple
 * two capabilities to make one line common.
 */
import { adminProductPlacementGet, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminProductPlacementResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { TemplateLifecycleApiError } from '../model/lifecycle-failure';

/** The Product's authoritative Sides and Areas, retired rows included. */
export async function fetchScopePlacement(
  productId: string,
  signal?: AbortSignal,
): Promise<AdminProductPlacementResponse> {
  try {
    const response = await adminProductPlacementGet(productId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return response.data;
  } catch (error: unknown) {
    throw new TemplateLifecycleApiError(normalizeApiClientError(error));
  }
}
