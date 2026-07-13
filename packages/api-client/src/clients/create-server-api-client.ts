import type { AxiosInstance } from 'axios';

import type { ApiClientConfig } from '../config/api-client-config';
import { HTTP_TIMEOUT_MS } from '../config/http-constants';
import { createAxiosApiClient } from './create-axios-api-client';

const ABSOLUTE_URL_PATTERN = /^https?:\/\//;

/**
 * Axios client for Server Components and server-side composition.
 * Uses a stricter timeout so slow upstream calls cannot stall rendering.
 *
 * Server-side code has no browser origin, so the base URL must be an
 * absolute internal service URL from INTERNAL_API_BASE_URL
 * (e.g. "http://api:4000/api"). That variable is server-only and must never
 * be exposed to the client bundle (no NEXT_PUBLIC_ prefix).
 */
export function createServerApiClient(config: ApiClientConfig): AxiosInstance {
  const baseUrl = config.baseUrl.trim();
  if (!ABSOLUTE_URL_PATTERN.test(baseUrl)) {
    throw new Error(
      'Server API client base URL must be an absolute internal http(s) URL (e.g. INTERNAL_API_BASE_URL); relative paths only work in a browser.',
    );
  }
  return createAxiosApiClient(config, HTTP_TIMEOUT_MS.server);
}
