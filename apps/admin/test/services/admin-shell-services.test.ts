import type { AxiosInstance } from 'axios';

import { fetchCurrentStaff } from '../../src/features/admin-shell/services/staff-self.service';
import { submitStaffLogout } from '../../src/features/admin-shell/services/staff-logout.service';
import { getBrowserApiClient } from '../../src/config/browser-api-client';
import { ADMIN_STAFF_FIXTURE } from '../support/staff-fixture';
import { makeApiClientError, makeNetworkError } from '../support/api-error';

// Only stub the browser client so the generated operations, the request mutator
// and the REAL error normalizer all run against a controllable Axios instance —
// no real network. The services never see a mocked '@embroidery/api-client'.
jest.mock('../../src/config/browser-api-client', () => ({
  getBrowserApiClient: jest.fn(),
}));

const request = jest.fn();
const mockGetClient = getBrowserApiClient as jest.MockedFunction<typeof getBrowserApiClient>;

beforeEach(() => {
  request.mockReset();
  mockGetClient.mockReset();
  mockGetClient.mockReturnValue({ request } as unknown as AxiosInstance);
});

describe('fetchCurrentStaff service', () => {
  it('returns the safe identity from the envelope data', async () => {
    request.mockResolvedValue({
      data: {
        success: true,
        code: 'OK',
        message: 'ok',
        data: ADMIN_STAFF_FIXTURE,
        meta: { requestId: 'req-1', timestamp: '2026-07-25T00:00:00.000Z' },
      },
    });

    await expect(fetchCurrentStaff()).resolves.toEqual(ADMIN_STAFF_FIXTURE);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/staff/me', method: 'GET' }),
    );
  });

  it('propagates the raw error so the query layer can classify it', async () => {
    const raw = makeApiClientError({ status: 401, code: 'STAFF_SESSION_INVALID' });
    request.mockRejectedValue(raw);
    await expect(fetchCurrentStaff()).rejects.toBe(raw);
  });
});

describe('submitStaffLogout service', () => {
  it('resolves on a 204 no-content', async () => {
    request.mockResolvedValue({ data: undefined });
    await expect(submitStaffLogout()).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/staff/session', method: 'DELETE' }),
    );
  });

  it('resolves on a 401 (the session is already gone)', async () => {
    request.mockRejectedValue(makeApiClientError({ status: 401, code: 'NO_SESSION' }));
    await expect(submitStaffLogout()).resolves.toBeUndefined();
  });

  it('rejects with a generic, non-technical error on a dependency failure', async () => {
    request.mockRejectedValue(makeNetworkError());
    await expect(submitStaffLogout()).rejects.toThrow('STAFF_LOGOUT_FAILED');
  });

  it('rejects on a 5xx failure', async () => {
    request.mockRejectedValue(makeApiClientError({ status: 503, code: 'UNAVAILABLE' }));
    await expect(submitStaffLogout()).rejects.toThrow('STAFF_LOGOUT_FAILED');
  });
});
