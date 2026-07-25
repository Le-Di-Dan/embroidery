import { normalizeApiClientError, staffSessionDelete } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

const UNAUTHORIZED_STATUS = 401;

/**
 * Feature service seam over the generated `staffSessionDelete` operation. Sends
 * no body and no credential header — the HttpOnly session cookie travels
 * automatically on the same-origin gateway request.
 *
 * A `401` means the session is already gone, which is the desired end state, so
 * it resolves as success. Any other failure (network/timeout/5xx) rejects so the
 * shell can stay visible and offer a safe retry. The raw Axios error never
 * escapes this boundary.
 */
export async function submitStaffLogout(): Promise<void> {
  try {
    await staffSessionDelete({ instance: getBrowserApiClient() });
  } catch (error: unknown) {
    const normalized = normalizeApiClientError(error);
    if (normalized.httpStatus === UNAUTHORIZED_STATUS) {
      return;
    }
    // Generic, non-technical failure. The cause is retained for diagnostics but
    // never surfaced to the UI, which shows only safe copy (§17).
    throw new Error('STAFF_LOGOUT_FAILED', { cause: error });
  }
}
