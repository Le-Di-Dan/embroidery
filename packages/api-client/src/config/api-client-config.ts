export interface ApiClientConfig {
  /**
   * Base URL of the business API. Callers resolve it from environment
   * configuration (browser: same-origin path from NEXT_PUBLIC_API_BASE_PATH;
   * server: absolute URL from INTERNAL_API_BASE_URL). Must not be hard-coded.
   */
  baseUrl: string;
  /** Optional override of the environment-appropriate default timeout. */
  timeoutMs?: number;
}
