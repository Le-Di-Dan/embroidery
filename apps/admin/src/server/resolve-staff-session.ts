import {
  normalizeApiClientError,
  staffSelfGet,
  type StaffSelfGet200,
} from '@embroidery/api-client';
import { cookies } from 'next/headers';

import { getServerApiClient } from '../config/server-api-client';
import { STAFF_SESSION_COOKIE_NAME_LIST } from '../config/session-cookie';

/** The minimum safe identity the Admin shell needs; mirrors `GET /api/staff/me`. */
export type ServerStaffIdentity = StaffSelfGet200['data'];

/**
 * Outcome of authoritative server-side session resolution.
 * - `authenticated`: the API returned a live staff identity (200).
 * - `unauthenticated`: no session cookie, or the API rejected it (401).
 * - `unavailable`: the API dependency failed (network/timeout/5xx). This is
 *   NOT the same as unauthenticated and must never redirect to `/login`.
 */
export type StaffSessionResolution =
  | { readonly status: 'authenticated'; readonly staff: ServerStaffIdentity }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'unavailable' };

const UNAUTHORIZED_STATUS = 401;

/**
 * Resolves the current staff session authoritatively by calling the API's
 * `GET /api/staff/me` with the incoming request cookies forwarded server-to-server.
 *
 * Cookie presence is only a fast short-circuit that avoids a needless upstream
 * call when no session cookie exists; it is never treated as authentication.
 * The HttpOnly cookie value is forwarded verbatim to the API and never parsed,
 * decoded, hashed, logged or exposed to Client Components.
 */
export async function resolveServerStaffSession(): Promise<StaffSessionResolution> {
  const cookieStore = await cookies();

  const hasSessionCookie = STAFF_SESSION_COOKIE_NAME_LIST.some(
    (name) => cookieStore.get(name) !== undefined,
  );
  if (!hasSessionCookie) {
    return { status: 'unauthenticated' };
  }

  try {
    const body = await staffSelfGet({
      instance: getServerApiClient(),
      // Forward the incoming Cookie header verbatim; never cache an identity.
      config: { headers: { Cookie: cookieStore.toString() } },
    });
    return { status: 'authenticated', staff: body.data };
  } catch (error: unknown) {
    const normalized = normalizeApiClientError(error);
    if (normalized.httpStatus === UNAUTHORIZED_STATUS) {
      return { status: 'unauthenticated' };
    }
    // Network, timeout or 5xx: a dependency failure, not an auth decision.
    return { status: 'unavailable' };
  }
}
