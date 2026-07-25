import { staffSelfGet, type CurrentStaffResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

/**
 * Feature service seam over the generated `staffSelfGet` operation. The browser
 * Axios instance is injected here so hooks/components never touch Axios directly
 * (FRONTEND_CONVENTIONS §8). Returns only the safe public identity
 * (`id`/`email`/`displayName`); no cookie, token, role or session object is read
 * or returned. The raw error is propagated so the query layer can classify it.
 */
export async function fetchCurrentStaff(): Promise<CurrentStaffResponse> {
  const body = await staffSelfGet({ instance: getBrowserApiClient() });
  return body.data;
}
