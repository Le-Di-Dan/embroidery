import {
  publicProductPlacementGet,
  type PublicProductPlacementResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { toStudioApiError } from '../model/studio-failure';

/**
 * The public placement manifest for one Product (`APP3-B01`).
 *
 * The **only** Side/Area authority the Studio has. The Admin placement pair is
 * not reachable from here and must never be: it exposes retired rows, the
 * background Asset id and a concurrency token, none of which an anonymous
 * visitor may see.
 *
 * The read is browser-side rather than server-side because Side and Area are
 * interaction state — the visitor changes them and the compatible Template list
 * changes with them — and a server-rendered copy would be a second, staler
 * answer to the same question.
 */
export async function fetchStudioPlacement(
  slug: string,
  signal: AbortSignal,
): Promise<PublicProductPlacementResponse> {
  try {
    const body = await publicProductPlacementGet(slug, {
      instance: getBrowserApiClient(),
      config: { signal },
    });
    return body.data;
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}
