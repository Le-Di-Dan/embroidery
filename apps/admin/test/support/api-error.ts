/**
 * Fabricate api-client-shaped errors for login tests without any real network.
 * The shapes mirror what a real Axios call surfaces (an error envelope in
 * `response.data`, a `Retry-After` header), so `normalizeApiClientError` and the
 * feature error mapper run their real production paths against them.
 */
export interface FabricatedFieldError {
  field: string;
  code: string;
  message: string;
}

export interface FabricatedApiErrorOptions {
  status: number;
  code: string;
  message?: string;
  errors?: FabricatedFieldError[];
  headers?: Record<string, string>;
}

export function makeApiClientError(options: FabricatedApiErrorOptions): unknown {
  const { status, code, message = 'Yêu cầu không hợp lệ.', errors, headers = {} } = options;
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message,
    response: {
      status,
      headers,
      data: {
        success: false,
        code,
        message,
        ...(errors === undefined ? {} : { errors }),
        meta: { requestId: 'req-test-0001', timestamp: '2026-07-25T00:00:00.000Z' },
      },
    },
  };
}

export function makeNetworkError(): unknown {
  return { isAxiosError: true, name: 'AxiosError', message: 'Network Error', code: 'ERR_NETWORK' };
}
