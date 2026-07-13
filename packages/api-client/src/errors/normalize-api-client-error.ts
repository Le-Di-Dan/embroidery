import { isApiResponseEnvelope, isApiErrorResponse } from '@embroidery/contracts';
import { isAxiosError } from 'axios';

import { API_CLIENT_ERROR_CODES } from './api-client-error-codes';
import type { NormalizedApiError } from './normalized-api-error';

const TIMEOUT_AXIOS_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

const MESSAGES = {
  timeout: 'The request timed out.',
  network: 'The API could not be reached.',
  malformed: 'The API returned an unexpected response shape.',
  unexpected: 'An unexpected error occurred while calling the API.',
} as const;

/**
 * Converts any error thrown by an Axios API call into the stable
 * NormalizedApiError shape. Never logs and never rethrows raw errors,
 * so sensitive request payloads cannot leak through this path.
 */
export function normalizeApiClientError(error: unknown): NormalizedApiError {
  if (isAxiosError(error)) {
    if (error.response !== undefined) {
      const payload: unknown = error.response.data;
      if (isApiResponseEnvelope(payload) && isApiErrorResponse(payload)) {
        return {
          code: payload.code,
          message: payload.message,
          httpStatus: error.response.status,
          requestId: payload.meta.requestId,
          ...(payload.errors === undefined ? {} : { fieldErrors: payload.errors }),
        };
      }
      return {
        code: API_CLIENT_ERROR_CODES.malformedResponse,
        message: MESSAGES.malformed,
        httpStatus: error.response.status,
      };
    }
    if (error.code !== undefined && TIMEOUT_AXIOS_CODES.has(error.code)) {
      return {
        code: API_CLIENT_ERROR_CODES.timeout,
        message: MESSAGES.timeout,
      };
    }
    return {
      code: API_CLIENT_ERROR_CODES.network,
      message: MESSAGES.network,
    };
  }

  return {
    code: API_CLIENT_ERROR_CODES.unexpected,
    message: MESSAGES.unexpected,
  };
}
