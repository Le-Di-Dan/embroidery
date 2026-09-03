import { NextResponse, type NextRequest } from 'next/server';

import {
  CONTENT_SECURITY_POLICY_HEADER,
  buildContentSecurityPolicy,
  createContentSecurityPolicyNonce,
} from './config/content-security-policy';
import { LOGIN_ROUTE } from './config/routes';
import { STAFF_SESSION_COOKIE_NAME_LIST } from './config/session-cookie';

/**
 * Admin request proxy (Next.js 16 `proxy` convention, the successor to
 * `middleware`). It carries two responsibilities:
 *
 * 1. fast cookie-presence session routing — never session validation;
 * 2. the per-response Content-Security-Policy nonce (`APP12-H02` §19).
 *
 * §19 forbids a second middleware/proxy authority, and Next.js allows exactly
 * one per application anyway, so the nonce joins the routing rule here.
 *
 * ## 1 — Session routing
 *
 * - a protected route with no session cookie redirects to `/login`;
 * - the `/login` route is always allowed (its own server logic redirects an
 *   already-authenticated visitor);
 * - a request that carries a session cookie is allowed through so the
 *   authoritative server resolver (`GET /api/staff/me`) can decide.
 *
 * The HttpOnly cookie value is never read, decoded, hashed or logged here.
 * Presence is a routing hint, not proof of authentication.
 *
 * ## 2 — The CSP nonce
 *
 * Every response leaves here carrying a freshly minted nonce, published in the
 * `Content-Security-Policy` header **and** injected into the forwarded request
 * headers, which is where the App Router renderer looks for it (see
 * `config/content-security-policy.ts`). Both writes are required: the response
 * header is what the browser enforces, the request header is what makes the
 * framework's own inline scripts satisfy it.
 *
 * The redirect answer carries the policy too. It renders no document of its own,
 * so the nonce buys nothing there — but a header set on every branch is a header
 * no future branch can forget, and the alternative is a response whose policy
 * depends on whether the visitor happened to be signed in.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = createContentSecurityPolicyNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    isProduction: process.env.NODE_ENV === 'production',
  });

  // The renderer reads the policy off the *request*; the browser enforces it
  // off the response. Cloning the incoming headers preserves everything the
  // gateway forwarded (correlation id, forwarded-proto) rather than replacing it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, policy);
  const forward = { request: { headers: requestHeaders } };

  const response = resolveRoute(request, forward);
  response.headers.set(CONTENT_SECURITY_POLICY_HEADER, policy);
  return response;
}

/** The unchanged cookie-presence routing decision. */
function resolveRoute(
  request: NextRequest,
  forward: { request: { headers: Headers } },
): NextResponse {
  if (request.nextUrl.pathname === LOGIN_ROUTE) {
    return NextResponse.next(forward);
  }

  const hasSessionCookie = STAFF_SESSION_COOKIE_NAME_LIST.some((name) => request.cookies.has(name));
  if (hasSessionCookie) {
    return NextResponse.next(forward);
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
