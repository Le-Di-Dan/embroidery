import { staffSessionCreate, type StaffLoginRequest } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

/**
 * Feature service seam over the generated `staffSessionCreate` operation. The
 * browser Axios instance is injected here so components/hooks never touch Axios
 * directly. On success the server issues the session cookie (204 No Content);
 * this function returns nothing and never reads or stores the cookie/token.
 */
export async function submitStaffLogin(credentials: StaffLoginRequest): Promise<void> {
  await staffSessionCreate(credentials, { instance: getBrowserApiClient() });
}
