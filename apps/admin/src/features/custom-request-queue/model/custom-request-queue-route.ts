/**
 * The Admin custom-request routes, in one place.
 *
 * The detail route is `APP5-A02`'s screen; `APP5-A01` only needs to *address*
 * it, and it does so through this function rather than by assembling a path in
 * a row component — one spelling, one place to change when A02 lands.
 */
export const ADMIN_REQUESTS_ROUTE = '/requests';

/** The canonical detail address for one request. `requestId` is a route key. */
export function adminCustomRequestDetailRoute(requestId: string): string {
  return `${ADMIN_REQUESTS_ROUTE}/${requestId}`;
}
