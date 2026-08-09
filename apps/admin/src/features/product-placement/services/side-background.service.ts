/**
 * Feature service seam over the one `APP3-B02A` Admin Side-background
 * operation.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `PlacementApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * This is the **only** module in the feature that names the operation. The route
 * itself is never spelled here: the generated client owns the URL, and a copy of
 * it in application code is how the two drift after a contract change.
 *
 * What the response is, and is not: `Blob` — the bytes themselves, streamed by
 * the API from private storage. There is no address in it. Nothing here builds a
 * MinIO or S3 URL, reads a storage key, or falls back to the public `APP3-B02`
 * route, which requires a PUBLISHED Product that placement authoring does not
 * have.
 */
import { adminProductSideBackgroundGet, normalizeApiClientError } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { PlacementApiError } from '../model/placement-failure';

export interface FetchSideBackgroundInput {
  readonly productId: string;
  readonly sideId: string;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Fetches one Side's authorized background bytes.
 *
 * `signal` is the query's own cancellation: switching Side while a large
 * background is still arriving aborts the request instead of decoding bytes
 * nobody will look at.
 */
export async function fetchSideBackground({
  productId,
  sideId,
  signal,
}: FetchSideBackgroundInput): Promise<Blob> {
  try {
    return await adminProductSideBackgroundGet(productId, sideId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
  } catch (error: unknown) {
    throw new PlacementApiError(normalizeApiClientError(error));
  }
}
