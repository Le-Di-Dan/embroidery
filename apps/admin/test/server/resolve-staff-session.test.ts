/**
 * @jest-environment node
 *
 * Authoritative server session resolution: cookie forwarding and the mapping of
 * API outcomes (200 / 401 / network / 5xx) to the resolution status. A network
 * or 5xx failure must map to `unavailable`, never `unauthenticated`.
 */
import { normalizeApiClientError, staffSelfGet } from '@embroidery/api-client';
import { cookies } from 'next/headers';

import { resolveServerStaffSession } from '../../src/server/resolve-staff-session';

jest.mock('@embroidery/api-client', () => ({
  staffSelfGet: jest.fn(),
  normalizeApiClientError: jest.fn(),
}));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('../../src/config/server-api-client', () => ({
  getServerApiClient: jest.fn(() => ({ __brand: 'server-client' })),
}));

const mockStaffSelfGet = staffSelfGet as jest.MockedFunction<typeof staffSelfGet>;
const mockNormalize = normalizeApiClientError as jest.MockedFunction<
  typeof normalizeApiClientError
>;
const mockCookies = cookies as jest.MockedFunction<typeof cookies>;

function withCookies(header: string, present: string[]): void {
  const store = {
    get: (name: string) => (present.includes(name) ? { name, value: 'opaque' } : undefined),
    toString: () => header,
  };
  mockCookies.mockResolvedValue(store as unknown as Awaited<ReturnType<typeof cookies>>);
}

const IDENTITY = { id: 'a1', email: 'admin@example.test', displayName: 'Operator' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveServerStaffSession', () => {
  it('short-circuits to unauthenticated with no session cookie and no API call', async () => {
    withCookies('', []);
    const result = await resolveServerStaffSession();
    expect(result).toEqual({ status: 'unauthenticated' });
    expect(mockStaffSelfGet).not.toHaveBeenCalled();
  });

  it('returns authenticated and forwards the Cookie header verbatim on 200', async () => {
    withCookies('adm_session=opaque', ['adm_session']);
    mockStaffSelfGet.mockResolvedValue({ data: IDENTITY } as Awaited<
      ReturnType<typeof staffSelfGet>
    >);

    const result = await resolveServerStaffSession();

    expect(result).toEqual({ status: 'authenticated', staff: IDENTITY });
    const call = mockStaffSelfGet.mock.calls[0]?.[0];
    expect(call?.config?.headers).toEqual({ Cookie: 'adm_session=opaque' });
  });

  it('maps a 401 to unauthenticated', async () => {
    withCookies('adm_session=stale', ['adm_session']);
    mockStaffSelfGet.mockRejectedValue(new Error('401'));
    mockNormalize.mockReturnValue({ code: 'X', message: 'x', httpStatus: 401 });

    expect(await resolveServerStaffSession()).toEqual({ status: 'unauthenticated' });
  });

  it('maps a network failure (no httpStatus) to unavailable', async () => {
    withCookies('adm_session=x', ['adm_session']);
    mockStaffSelfGet.mockRejectedValue(new Error('network'));
    mockNormalize.mockReturnValue({ code: 'NETWORK', message: 'x' });

    expect(await resolveServerStaffSession()).toEqual({ status: 'unavailable' });
  });

  it('maps a 5xx to unavailable, not unauthenticated', async () => {
    withCookies('adm_session=x', ['adm_session']);
    mockStaffSelfGet.mockRejectedValue(new Error('500'));
    mockNormalize.mockReturnValue({ code: 'X', message: 'x', httpStatus: 503 });

    expect(await resolveServerStaffSession()).toEqual({ status: 'unavailable' });
  });

  it('recognizes the production cookie name for the presence hint', async () => {
    withCookies('__Host-adm_session=x', ['__Host-adm_session']);
    mockStaffSelfGet.mockResolvedValue({ data: IDENTITY } as Awaited<
      ReturnType<typeof staffSelfGet>
    >);
    expect(await resolveServerStaffSession()).toEqual({ status: 'authenticated', staff: IDENTITY });
  });
});
