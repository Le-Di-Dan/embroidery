export interface ApiClientConfig {
  /**
   * Base URL of the business API. Callers resolve it from environment
   * configuration (e.g. NEXT_PUBLIC_API_BASE_URL in the browser,
   * API_BASE_URL on the server). Must not be hard-coded.
   */
  baseUrl: string;
  /** Optional override of the environment-appropriate default timeout. */
  timeoutMs?: number;
}
