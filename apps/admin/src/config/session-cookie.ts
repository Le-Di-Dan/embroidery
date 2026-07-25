/**
 * Canonical Admin session cookie names (ADR-APP1-001 §5), shared by the request
 * proxy and the server session resolver. Development uses the unprefixed name
 * over plain HTTP; production uses the `__Host-` prefixed name. These are a
 * protocol contract with the API's `CookiePolicyService`, not a business value.
 *
 * This module holds constants only — no `server-only` import — so the Edge
 * request proxy (`proxy.ts`) can import it. The cookie is HttpOnly, so its
 * VALUE is never read here or in any client code; only its presence is used as
 * a fast routing hint. Authoritative validation is always the API's job.
 */
export const STAFF_SESSION_COOKIE_NAMES = {
  development: 'adm_session',
  production: '__Host-adm_session',
} as const;

/** Both canonical names; presence of either is a routing hint, never proof of auth. */
export const STAFF_SESSION_COOKIE_NAME_LIST: readonly string[] = [
  STAFF_SESSION_COOKIE_NAMES.development,
  STAFF_SESSION_COOKIE_NAMES.production,
];
