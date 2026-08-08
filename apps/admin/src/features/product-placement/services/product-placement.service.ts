/**
 * Feature service seam over the two `APP3-B01` Admin placement operations.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `PlacementApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * Both calls normalize the response before returning it, so the weakly-typed
 * nullable members of the generated contract stop at this boundary and every
 * caller works with `PlacementModel`.
 *
 * The **public** placement operation is deliberately unreachable from here. It
 * answers a different, narrower model — no `backgroundAssetId`, no retired rows
 * and no concurrency token — and authoring against it would silently drop the
 * history the operator is meant to see.
 */
import {
  adminProductPlacementGet,
  adminProductPlacementReplace,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { ReplaceProductPlacementBody } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { PlacementApiError } from '../model/placement-failure';
import { normalizePlacement, type PlacementModel } from '../model/placement-model';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

/**
 * The complete authoring model, retired rows included.
 *
 * Read-only on the server — it records nothing — so it is safe to refetch as
 * often as the screen needs, including immediately after a save refused.
 */
export async function fetchPlacement(
  productId: string,
  signal?: AbortSignal,
): Promise<PlacementModel> {
  try {
    const response = await adminProductPlacementGet(productId, requestOptions(signal));
    return normalizePlacement(response.data);
  } catch (error: unknown) {
    throw new PlacementApiError(normalizeApiClientError(error));
  }
}

/**
 * Replaces the whole placement model atomically.
 *
 * A stale `expectedUpdatedAt` is refused and **nothing** is written, so a
 * failure here never leaves a half-applied tree. The answer is the whole model
 * again with a fresh token, which is why the caller replaces its snapshot from
 * this response rather than issuing another read.
 */
export async function replacePlacement(
  productId: string,
  body: ReplaceProductPlacementBody,
  signal?: AbortSignal,
): Promise<PlacementModel> {
  try {
    const response = await adminProductPlacementReplace(productId, body, requestOptions(signal));
    return normalizePlacement(response.data);
  } catch (error: unknown) {
    throw new PlacementApiError(normalizeApiClientError(error));
  }
}
