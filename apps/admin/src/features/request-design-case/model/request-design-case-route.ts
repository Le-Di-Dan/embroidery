/**
 * The one route this feature owns (`APP6-A02` §1).
 *
 * A feature-owned builder rather than a literal repeated at each call site, so
 * the segment name lives beside the screen that answers it. It is a path, not an
 * authorization: `APP5-B04`, `APP6-B07`, `APP6-B08`, `APP6-B09` and A02's own
 * exact-version read each re-check the Admin session on every request, and a
 * request id in a URL grants nothing on its own.
 */
export function ADMIN_REQUEST_DESIGN_ROUTE(requestId: string): string {
  return `/requests/${requestId}/design`;
}

/**
 * Where the request-detail screen lives, for the two links back to it.
 *
 * Written here rather than imported from `APP5-A02` because that feature
 * publishes one export — its screen — and reaching past it for a path would be
 * a deep import into another bounded feature. `APP6-A01` states the same
 * segment for the same reason. The gate links here because `APP6-B06`'s
 * `DIGITIZING` transition control lives on that screen and is not duplicated on
 * this one.
 */
export function ADMIN_REQUEST_DETAIL_ROUTE(requestId: string): string {
  return `/requests/${requestId}`;
}
