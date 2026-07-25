/**
 * Canonical Admin route constants, shared by the Edge request proxy and the
 * server session guards. Neutral module (no `server-only`) so the proxy runtime
 * can import it. Not business values — application routing contract.
 */

/** The only public (unauthenticated) Admin screen. */
export const LOGIN_ROUTE = '/login';

/** Authenticated default route; APP1-A02 replaces its placeholder with the shell. */
export const AUTHENTICATED_HOME_ROUTE = '/';
