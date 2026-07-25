import { createServerApiClient } from '@embroidery/api-client';

import { toApiOriginBase } from './api-base';

/**
 * Internal Docker-network API base URL for server-to-server calls (D-036). Read
 * from `INTERNAL_API_BASE_URL` (e.g. `http://api:4000/api`). Server-only by
 * construction: it is consumed exclusively by server modules that use
 * `next/headers`/`next/navigation` (which throw in a Client Component), and
 * `INTERNAL_API_BASE_URL` is never exposed to the client bundle (no
 * `NEXT_PUBLIC_` prefix). The browser never uses this client — it talks to the
 * same-origin gateway path instead (`config/browser-api-client.ts`).
 */
type ServerApiClient = ReturnType<typeof createServerApiClient>;

let cachedClient: ServerApiClient | undefined;

/**
 * Lazily create and memoize the single server Axios instance for the Admin app.
 * The instance carries no per-request state; the incoming session `Cookie`
 * header is forwarded per call via `{ config: { headers } }`, never stored on
 * the instance, so one memoized client is safe across concurrent requests.
 */
export function getServerApiClient(): ServerApiClient {
  if (cachedClient === undefined) {
    const baseUrl = process.env.INTERNAL_API_BASE_URL;
    if (baseUrl === undefined || baseUrl.trim() === '') {
      throw new Error(
        'INTERNAL_API_BASE_URL is not set. The Admin server needs the internal API base URL to resolve staff sessions.',
      );
    }
    cachedClient = createServerApiClient({ baseUrl: toApiOriginBase(baseUrl) });
  }
  return cachedClient;
}
