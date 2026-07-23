import type { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * Per-call options for a generated operation. The Axios instance is injected
 * explicitly by the caller — obtained from `createBrowserApiClient` or
 * `createServerApiClient` — so the generated layer owns no Axios singleton and
 * the browser/server base-URL split (D-036) is preserved. SSR-safe: no
 * module-level client is created here.
 */
export interface ApiRequestOptions {
  /**
   * Axios instance for this call. Required; the mutator throws without it so a
   * missing instance fails loudly instead of hitting an unconfigured default.
   */
  instance: AxiosInstance;
  /** Optional per-call Axios overrides (e.g. `signal`, extra headers). */
  config?: AxiosRequestConfig;
}

/**
 * Orval `axios-functions` mutator. Every generated operation routes its
 * request through the caller-provided Axios instance, so base URL,
 * interceptors, timeout and error handling stay owned by the handwritten
 * runtime. Returns the response body (`T`); transport/error normalization is
 * the caller's concern via `normalizeApiClientError`. This mutator never
 * creates or injects an `X-Request-ID` — that contract is owned by the gateway
 * and API (IMP-D020).
 */
export function apiRequest<T>(
  requestConfig: AxiosRequestConfig,
  options?: ApiRequestOptions,
): Promise<T> {
  if (options?.instance === undefined) {
    throw new Error(
      'A generated API operation was called without an Axios instance. Pass { instance } from createBrowserApiClient/createServerApiClient.',
    );
  }
  const { instance, config } = options;
  return instance.request<T>({ ...requestConfig, ...config }).then((response) => response.data);
}
