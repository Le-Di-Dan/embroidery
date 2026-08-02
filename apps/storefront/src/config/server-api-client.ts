import { createServerApiClient } from '@embroidery/api-client';

import { toApiOriginBase } from './api-base';

/**
 * Internal Docker-network API base URL for the Storefront's server-side reads
 * (D-036), from `INTERNAL_API_BASE_URL` (e.g. `http://api:4000/api`).
 * Server-only: `INTERNAL_API_BASE_URL` carries no `NEXT_PUBLIC_` prefix, so it
 * never reaches the client bundle, and the browser talks to the same-origin
 * gateway path instead (`config/browser-api-client.ts`).
 *
 * The Storefront's server calls are **anonymous**. Unlike the Admin equivalent
 * this module forwards no cookie and its callers must not add one: the public
 * catalog is readable without a session, and attaching a staff cookie to an
 * anonymous read would be the first step toward a page whose content depends on
 * who is looking at it.
 */
type ServerApiClient = ReturnType<typeof createServerApiClient>;

let cachedClient: ServerApiClient | undefined;

/**
 * Lazily create and memoize the single server Axios instance for the Storefront.
 * The instance carries no per-request state, so one memoized client is safe
 * across concurrent requests.
 */
export function getServerApiClient(): ServerApiClient {
  if (cachedClient === undefined) {
    const baseUrl = process.env.INTERNAL_API_BASE_URL;
    if (baseUrl === undefined || baseUrl.trim() === '') {
      throw new Error(
        'INTERNAL_API_BASE_URL is not set. The Storefront server needs the internal API base URL to render the published catalog.',
      );
    }
    cachedClient = createServerApiClient({ baseUrl: toApiOriginBase(baseUrl) });
  }
  return cachedClient;
}
