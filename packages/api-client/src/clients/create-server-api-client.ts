import type { AxiosInstance } from 'axios';

import type { ApiClientConfig } from '../config/api-client-config';
import { HTTP_TIMEOUT_MS } from '../config/http-constants';
import { createAxiosApiClient } from './create-axios-api-client';

/**
 * Axios client for Server Components and server-side composition.
 * Uses a stricter timeout so slow upstream calls cannot stall rendering.
 */
export function createServerApiClient(config: ApiClientConfig): AxiosInstance {
  return createAxiosApiClient(config, HTTP_TIMEOUT_MS.server);
}
