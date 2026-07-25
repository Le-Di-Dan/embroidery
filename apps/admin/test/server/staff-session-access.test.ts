/**
 * @jest-environment node
 *
 * Route guards over the resolver: protected routes redirect the unauthenticated
 * to `/login` and throw on a dependency outage (never a login redirect); the
 * login route redirects an authenticated visitor to `/` and otherwise renders.
 */
import { redirect } from 'next/navigation';

import { resolveServerStaffSession } from '../../src/server/resolve-staff-session';
import {
  StaffSessionUnavailableError,
  redirectAuthenticatedStaffFromLogin,
  requireServerStaffSession,
} from '../../src/server/staff-session-access';

jest.mock('../../src/server/resolve-staff-session', () => ({
  resolveServerStaffSession: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const mockResolve = resolveServerStaffSession as jest.MockedFunction<
  typeof resolveServerStaffSession
>;
const mockRedirect = redirect as unknown as jest.Mock;

const IDENTITY = { id: 'a1', email: 'admin@example.test', displayName: 'Operator' };

beforeEach(() => jest.clearAllMocks());

describe('requireServerStaffSession', () => {
  it('returns the identity for an authenticated session', async () => {
    mockResolve.mockResolvedValue({ status: 'authenticated', staff: IDENTITY });
    await expect(requireServerStaffSession()).resolves.toEqual(IDENTITY);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects an unauthenticated request to /login', async () => {
    mockResolve.mockResolvedValue({ status: 'unauthenticated' });
    await expect(requireServerStaffSession()).rejects.toThrow('REDIRECT:/login');
  });

  it('throws a dependency error on unavailable, never redirecting', async () => {
    mockResolve.mockResolvedValue({ status: 'unavailable' });
    await expect(requireServerStaffSession()).rejects.toBeInstanceOf(StaffSessionUnavailableError);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe('redirectAuthenticatedStaffFromLogin', () => {
  it('redirects an authenticated visitor to /', async () => {
    mockResolve.mockResolvedValue({ status: 'authenticated', staff: IDENTITY });
    await expect(redirectAuthenticatedStaffFromLogin()).rejects.toThrow('REDIRECT:/');
  });

  it('renders login for an unauthenticated visitor (no redirect)', async () => {
    mockResolve.mockResolvedValue({ status: 'unauthenticated' });
    await expect(redirectAuthenticatedStaffFromLogin()).resolves.toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('renders login (no loop) when the dependency is unavailable', async () => {
    mockResolve.mockResolvedValue({ status: 'unavailable' });
    await expect(redirectAuthenticatedStaffFromLogin()).resolves.toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
