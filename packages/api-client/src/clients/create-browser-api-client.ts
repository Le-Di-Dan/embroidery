import type { AxiosInstance } from 'axios';

import type { ApiClientConfig } from '../config/api-client-config';
import { HTTP_TIMEOUT_MS } from '../config/http-constants';
import { createAxiosApiClient } from './create-axios-api-client';

const ABSOLUTE_URL_PATTERN = /^https?:\/\//;

/**
 * Axios client for browser-originated requests to the internal business API.
 * Feature services wrap this client; components never call it directly.
 *
 * In gateway mode (D-036) the browser calls the same-origin path from
 * NEXT_PUBLIC_API_BASE_PATH (e.g. "/api") — never a direct host:port.
 * Absolute URLs remain allowed for controlled non-gateway setups.
 */
export function createBrowserApiClient(config: ApiClientConfig): AxiosInstance {
  const baseUrl = config.baseUrl.trim();
  if (!baseUrl.startsWith('/') && !ABSOLUTE_URL_PATTERN.test(baseUrl)) {
    throw new Error(
      'Browser API client base URL must be a same-origin path (e.g. "/api") or an absolute http(s) URL.',
    );
  }
  return createAxiosApiClient(config, HTTP_TIMEOUT_MS.browser);
}
