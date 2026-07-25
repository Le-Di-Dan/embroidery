import { redirect } from 'next/navigation';

import { AUTHENTICATED_HOME_ROUTE, LOGIN_ROUTE } from '../config/routes';
import { resolveServerStaffSession, type ServerStaffIdentity } from './resolve-staff-session';

/**
 * Thrown when the API session dependency is unavailable (network/timeout/5xx)
 * while resolving a protected route. It is NOT an authentication failure, so it
 * surfaces to the nearest error boundary instead of redirecting to `/login`.
 */
export class StaffSessionUnavailableError extends Error {
  constructor() {
    super('The staff session service is temporarily unavailable.');
    this.name = 'StaffSessionUnavailableError';
  }
}

/**
 * Guard for protected Server Components/layouts. Returns the authenticated staff
 * identity, redirects unauthenticated requests to `/login`, and throws on a
 * dependency failure so a transient API outage is never misread as signed-out.
 */
export async function requireServerStaffSession(): Promise<ServerStaffIdentity> {
  const resolution = await resolveServerStaffSession();
  if (resolution.status === 'authenticated') {
    return resolution.staff;
  }
  if (resolution.status === 'unauthenticated') {
    redirect(LOGIN_ROUTE);
  }
  throw new StaffSessionUnavailableError();
}

/**
 * Login-route guard. Redirects an already-authenticated staff member to the
 * authenticated home; otherwise returns so the login page renders. An invalid or
 * stale cookie (unauthenticated) and a dependency failure (unavailable) both
 * render login — never a redirect loop, and never clearing a valid session.
 */
export async function redirectAuthenticatedStaffFromLogin(): Promise<void> {
  const resolution = await resolveServerStaffSession();
  if (resolution.status === 'authenticated') {
    redirect(AUTHENTICATED_HOME_ROUTE);
  }
}
