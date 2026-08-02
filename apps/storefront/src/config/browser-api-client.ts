import { createBrowserApiClient } from '@embroidery/api-client';

import { toApiOriginBase } from './api-base';

/**
 * Same-origin gateway base for browser API calls (D-036), resolved from
 * `NEXT_PUBLIC_API_BASE_PATH`; the constant is the documented gateway default,
 * not a business value. The generated operations already include the `/api`
 * prefix, so the axios base is reduced to the origin (`toApiOriginBase`) to
 * avoid a `/api/api/...` 404.
 *
 * Storefront browser calls are anonymous: the public catalog needs no
 * credentials, and because the request is same-origin nothing has to be
 * configured for cookies either way.
 */
const DEFAULT_API_BASE_PATH = '/api';

type BrowserApiClient = ReturnType<typeof createBrowserApiClient>;

let cachedClient: BrowserApiClient | undefined;

/**
 * Lazily create and memoize the single browser Axios instance for the
 * Storefront. Feature services pass the returned instance into generated
 * operations via `{ instance }`; a feature never instantiates Axios ad hoc
 * (FRONTEND_CONVENTIONS §8).
 */
export function getBrowserApiClient(): BrowserApiClient {
  if (cachedClient === undefined) {
    const baseUrl = toApiOriginBase(process.env.NEXT_PUBLIC_API_BASE_PATH ?? DEFAULT_API_BASE_PATH);
    cachedClient = createBrowserApiClient({ baseUrl });
  }
  return cachedClient;
}
