import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import { staffSelfGet } from '../generated/embroidery-api';
import type { StaffSelfGet200, CurrentStaffResponse } from '../generated/embroidery-api.schemas';
import { normalizeApiClientError } from '../errors/normalize-api-client-error';

// --- Compile-time contract (APP1-B02-C1): success `data` is required. ---
type IsOptional<T, K extends keyof T> = Record<never, never> extends Pick<T, K> ? true : false;
type Assert<T extends true> = T;
// Fails to compile if `data` ever becomes optional again.
type _StaffSelfDataIsRequired = Assert<
  IsOptional<StaffSelfGet200, 'data'> extends false ? true : false
>;
// `data` is exactly the safe current-staff payload.
type _StaffSelfDataIsCurrentStaff = Assert<
  StaffSelfGet200['data'] extends CurrentStaffResponse ? true : false
>;

interface RecordingInstance {
  instance: AxiosInstance;
  calls: AxiosRequestConfig[];
}

/** Records requests and resolves with the supplied response body. */
function resolvingInstance(data: unknown): RecordingInstance {
  const calls: AxiosRequestConfig[] = [];
  const request = (config: AxiosRequestConfig): Promise<{ data: unknown }> => {
    calls.push(config);
    return Promise.resolve({ data });
  };
  return { instance: { request } as unknown as AxiosInstance, calls };
}

const SUCCESS_ENVELOPE = {
  success: true,
  code: 'STAFF_SELF_READ',
  message: 'Current staff retrieved.',
  data: { id: 'admin-1', email: 'admin@example.test', displayName: 'Operator' },
  meta: { requestId: 'req-1', timestamp: '2026-07-25T00:00:00.000Z' },
};

describe('generated staff self operation (FU-A08)', () => {
  it('sends GET /api/staff/me and resolves the typed current-staff envelope', async () => {
    const { instance, calls } = resolvingInstance(SUCCESS_ENVELOPE);

    const result = await staffSelfGet({ instance });

    expect(result).toEqual(SUCCESS_ENVELOPE);
    // Typed access to the current-staff payload is available without a manual cast.
    expect(result.data?.email).toBe('admin@example.test');
    expect(calls[0]).toMatchObject({ url: '/api/staff/me', method: 'GET' });
  });

  it('passes no cookie, token or session argument — the browser runtime owns the cookie', () => {
    // The generated function accepts only request options; it has arity 1 and
    // its single call carries no body.
    expect(staffSelfGet.length).toBe(1);
    const { instance, calls } = resolvingInstance(SUCCESS_ENVELOPE);
    void staffSelfGet({ instance });
    expect(calls[0]?.data).toBeUndefined();
    expect(JSON.stringify(calls[0] ?? {})).not.toMatch(/token|cookie|session/i);
  });

  it('requires data on a successful current-staff response (compile-time contract)', () => {
    // The module-level `_StaffSelfDataIsRequired` alias already fails to compile
    // if `data` becomes optional; this fixture proves it at value level too.
    const valid: StaffSelfGet200 = {
      success: true,
      code: 'STAFF_SELF_READ',
      message: 'Current staff retrieved.',
      data: { id: 'admin-1', email: 'admin@example.test', displayName: 'Operator' },
      meta: { requestId: 'req-1', timestamp: '2026-07-25T00:00:00.000Z' },
    };
    expect(valid.data.id).toBe('admin-1');

    // @ts-expect-error — omitting `data` must not type-check for a 200 response.
    const missingData: StaffSelfGet200 = {
      success: true,
      code: 'STAFF_SELF_READ',
      message: 'Current staff retrieved.',
      meta: { requestId: 'req-2', timestamp: '2026-07-25T00:00:00.000Z' },
    };
    expect(missingData.code).toBe('STAFF_SELF_READ');
  });

  it('normalizes a canonical 401 error envelope', () => {
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.',
          meta: { requestId: 'req-401', timestamp: '2026-07-25T00:00:00.000Z' },
        },
      },
    };

    const normalized = normalizeApiClientError(axiosError);

    expect(normalized).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
      httpStatus: 401,
      requestId: 'req-401',
    });
  });
});
