/**
 * The one route this feature owns (`APP6-A01` §2).
 *
 * A feature-owned builder rather than a literal repeated at each call site, so
 * the segment name lives beside the screen that answers it. It is a path, not an
 * authorization: `APP5-B04`, `APP6-B01`, `APP6-B02` and `APP6-B03` each re-check
 * the Admin session on every request, and a request id in a URL grants nothing.
 */
export function ADMIN_REQUEST_QUOTATION_ROUTE(requestId: string): string {
  return `/requests/${requestId}/quotation`;
}
