/**
 * Stable client-side error codes used when the API envelope is unavailable
 * (network failure, timeout, malformed response, unexpected exception).
 */
export const API_CLIENT_ERROR_CODES = {
  network: 'NETWORK_ERROR',
  timeout: 'REQUEST_TIMEOUT',
  malformedResponse: 'MALFORMED_RESPONSE',
  unexpected: 'UNEXPECTED_CLIENT_ERROR',
} as const;

export type ApiClientErrorCode =
  (typeof API_CLIENT_ERROR_CODES)[keyof typeof API_CLIENT_ERROR_CODES];
