import axios, { type AxiosInstance } from 'axios';

import type { ApiClientConfig } from '../config/api-client-config';

/**
 * Shared low-level factory used by the browser and server client factories.
 * Interceptors stay infrastructure-only; feature business logic is prohibited
 * here (FRONTEND_CONVENTIONS.md §8).
 */
export function createAxiosApiClient(
  config: ApiClientConfig,
  defaultTimeoutMs: number,
): AxiosInstance {
  if (config.baseUrl.trim() === '') {
    throw new Error('API client base URL must be a non-empty string resolved from configuration.');
  }

  return axios.create({
    baseURL: config.baseUrl,
    timeout: config.timeoutMs ?? defaultTimeoutMs,
    headers: {
      Accept: 'application/json',
    },
  });
}
