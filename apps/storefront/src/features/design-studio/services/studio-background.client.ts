import { publicProductSideBackgroundGet } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { toStudioApiError } from '../model/studio-failure';

/**
 * The approved editor-safe background of the Session's Product Side
 * (`APP3-B02`).
 *
 * The address is **contextual**: a public Product slug and the Side's stable
 * public code. Neither is an asset id, a derivative id or a storage key, and
 * there is deliberately no generic route that would take one — publication,
 * category visibility, side activity, the background association and the
 * derivative are all re-proved by the server on every request, so knowing the
 * address grants nothing on its own.
 *
 * Both values come from the Design Session's own scope, which is what makes
 * this the *Session's* background rather than whichever Side a picker happens
 * to be showing. Nothing here builds a URL, reads a bucket or presigns.
 */
export async function fetchSideBackgroundBlob(
  productSlug: string,
  sideCode: string,
  signal: AbortSignal,
): Promise<Blob> {
  try {
    return await publicProductSideBackgroundGet(productSlug, sideCode, {
      instance: getBrowserApiClient(),
      config: { signal },
    });
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}
