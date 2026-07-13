/** Timeout defaults for internal business API calls. */
export const HTTP_TIMEOUT_MS = {
  /** Browser-originated requests tolerate slower networks. */
  browser: 15_000,
  /** Server-side composition must fail fast to protect rendering time. */
  server: 5_000,
} as const;
