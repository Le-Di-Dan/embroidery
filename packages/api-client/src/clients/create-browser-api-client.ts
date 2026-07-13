import type { AxiosInstance } from 'axios';

import type { ApiClientConfig } from '../config/api-client-config';
import { HTTP_TIMEOUT_MS } from '../config/http-constants';
import { createAxiosApiClient } from './create-axios-api-client';

/**
 * Axios client for browser-originated requests to the internal business API.
 * Feature services wrap this client; components never call it directly.
 */
export function createBrowserApiClient(config: ApiClientConfig): AxiosInstance {
  return createAxiosApiClient(config, HTTP_TIMEOUT_MS.browser);
}
