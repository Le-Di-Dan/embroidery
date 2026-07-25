import { NextResponse, type NextRequest } from 'next/server';

import { LOGIN_ROUTE } from './config/routes';
import { STAFF_SESSION_COOKIE_NAME_LIST } from './config/session-cookie';

/**
 * Admin request proxy (Next.js 16 `proxy` convention, the successor to
 * `middleware`). It performs ONLY fast cookie-presence routing — never session
 * validation:
 *
 * - a protected route with no session cookie redirects to `/login`;
 * - the `/login` route is always allowed (its own server logic redirects an
 *   already-authenticated visitor);
 * - a request that carries a session cookie is allowed through so the
 *   authoritative server resolver (`GET /api/staff/me`) can decide.
 *
 * The HttpOnly cookie value is never read, decoded, hashed or logged here.
 * Presence is a routing hint, not proof of authentication.
 */
export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname === LOGIN_ROUTE) {
    return NextResponse.next();
  }

  const hasSessionCookie = STAFF_SESSION_COOKIE_NAME_LIST.some((name) => request.cookies.has(name));
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const target = request.nextUrl.clone();
  target.pathname = LOGIN_ROUTE;
  target.search = '';
  return NextResponse.redirect(target);
}

export const config = {
  // Protect every application route. Framework/static/internal paths are
  // excluded so assets are never redirected to `/login`: Next internals
  // (`_next/*`), the app health route (`/healthz`), the favicon and
  // `.well-known` probes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|healthz|.well-known).*)'],
};
