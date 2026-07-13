import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { API_CLIENT_ERROR_CODES } from './api-client-error-codes';
import { normalizeApiClientError } from './normalize-api-client-error';

function buildAxiosError(options: { status?: number; data?: unknown; code?: string }): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const response =
    options.status === undefined
      ? undefined
      : ({
          status: options.status,
          statusText: 'error',
          data: options.data,
          headers: {},
          config,
        } as AxiosResponse);
  return new AxiosError('request failed', options.code, config, undefined, response);
}

const envelopeError = {
  success: false,
  code: 'INVALID_ORDER_TRANSITION',
  message: 'The order cannot move to production',
  errors: [{ field: 'status', code: 'DEPOSIT_NOT_PAID', message: 'Deposit required' }],
  meta: { requestId: 'req-42', timestamp: '2026-07-13T00:00:00.000Z' },
};

describe('normalizeApiClientError', () => {
  it('extracts code, message, requestId and field errors from an envelope error', () => {
    const normalized = normalizeApiClientError(
      buildAxiosError({ status: 409, data: envelopeError }),
    );
    expect(normalized).toEqual({
      code: 'INVALID_ORDER_TRANSITION',
      message: 'The order cannot move to production',
      httpStatus: 409,
      requestId: 'req-42',
      fieldErrors: envelopeError.errors,
    });
  });

  it('omits fieldErrors when the envelope has none', () => {
    const { errors: _errors, ...withoutErrors } = envelopeError;
    const normalized = normalizeApiClientError(
      buildAxiosError({ status: 404, data: withoutErrors }),
    );
    expect(normalized.code).toBe(withoutErrors.code);
    expect(normalized.fieldErrors).toBeUndefined();
  });

  it('flags a non-envelope response body as malformed', () => {
    const normalized = normalizeApiClientError(
      buildAxiosError({ status: 502, data: '<html>Bad gateway</html>' }),
    );
    expect(normalized.code).toBe(API_CLIENT_ERROR_CODES.malformedResponse);
    expect(normalized.httpStatus).toBe(502);
  });

  it('maps timeouts to REQUEST_TIMEOUT', () => {
    const normalized = normalizeApiClientError(buildAxiosError({ code: 'ECONNABORTED' }));
    expect(normalized.code).toBe(API_CLIENT_ERROR_CODES.timeout);
    expect(normalized.httpStatus).toBeUndefined();
  });

  it('maps connection failures to NETWORK_ERROR', () => {
    const normalized = normalizeApiClientError(buildAxiosError({ code: 'ECONNREFUSED' }));
    expect(normalized.code).toBe(API_CLIENT_ERROR_CODES.network);
  });

  it('maps non-Axios errors to UNEXPECTED_CLIENT_ERROR', () => {
    const normalized = normalizeApiClientError(new Error('boom'));
    expect(normalized.code).toBe(API_CLIENT_ERROR_CODES.unexpected);
  });
});
