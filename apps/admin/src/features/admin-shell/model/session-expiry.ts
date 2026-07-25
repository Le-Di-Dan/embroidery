import { normalizeApiClientError } from '@embroidery/api-client';

/**
 * Canonical query key for the current-staff identity. Handwritten TanStack
 * hooks key off this constant so the server-hydrated cache and every client
 * consumer address the same entry (OPENAPI-AND-CLIENT-CONTRACT — hooks are
 * handwritten, generated operations stay hook-free).
 */
export const STAFF_SELF_QUERY_KEY = ['staff', 'self'] as const;

/**
 * Bounded freshness window for the server-hydrated current-staff identity.
 *
 * The protected layout already resolved the session server-side, so the client
 * query is seeded with that result and must NOT refetch immediately on mount —
 * a positive `staleTime` guarantees exactly one initial backend call per
 * navigation. It is short (30s) so a later window-focus/reconnect still
 * re-validates the session; it is not a keep-alive (no polling, no renew call).
 */
export const STAFF_SELF_STALE_TIME_MS = 30_000;

const UNAUTHORIZED_STATUS = 401;

/**
 * A later client refetch proved the session is no longer authorized (401).
 * Only ever raised after the shell was already authenticated, so it maps to the
 * approved session-expired modal — never to the initial-load path.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('The staff session has expired.');
    this.name = 'SessionExpiredError';
  }
}

/**
 * A later client refetch failed for a dependency reason (network/timeout/5xx).
 * The shell stays visible with a safe reconnect indication; this is NOT an
 * expiry and must never show the session-expired modal.
 */
export class SessionRefetchError extends Error {
  constructor() {
    super('The staff session could not be re-validated.');
    this.name = 'SessionRefetchError';
  }
}

/**
 * Map a raw api-client error from a current-staff refetch to a typed shell
 * error. A 401 is a genuine expiry; anything else (network/timeout/5xx/malformed)
 * is a transient dependency failure. The raw Axios error never escapes.
 */
export function classifySessionError(error: unknown): Error {
  const normalized = normalizeApiClientError(error);
  if (normalized.httpStatus === UNAUTHORIZED_STATUS) {
    return new SessionExpiredError();
  }
  return new SessionRefetchError();
}

/** Client-observable session state derived from the current-staff query. */
export type SessionExpiryState = 'active' | 'expired' | 'reconnecting';

/**
 * Derive the session state from the current-staff query. Because the query is
 * seeded with server-resolved identity, a failed background refetch keeps the
 * last good data and surfaces its error through `failureReason` (React Query
 * leaves `status: 'success'` while data exists); the no-data path uses `error`.
 * We read both so a later 401 or dependency failure is detected in either case.
 */
export function deriveSessionExpiry(query: {
  readonly error: unknown;
  readonly failureReason: unknown;
}): SessionExpiryState {
  const failure = query.error ?? query.failureReason;
  if (failure instanceof SessionExpiredError) {
    return 'expired';
  }
  if (failure instanceof SessionRefetchError) {
    return 'reconnecting';
  }
  return 'active';
}
