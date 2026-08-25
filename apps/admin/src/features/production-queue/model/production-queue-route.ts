/**
 * The Admin production routes, in one place.
 *
 * `/san-xuat` is the address the approved `APP8-D01` package fixes for the
 * production queue (`780:27` breadcrumb `Quản trị / Sản xuất`), and
 * `/san-xuat/{jobId}` the one it fixes for the job detail (`784:3`). The
 * Product Owner approved the whole package, so the Vietnamese slug is the
 * route identity for this phase; the fact that older Admin segments use
 * English names is carried unchanged as `FU-APP8-A01-03` and is not
 * reconciled here.
 *
 * The detail address is spelled once, here, rather than assembled inside a row
 * component — the queue only needs to *address* it. `APP8-A03` creates the
 * segment behind it; this checkpoint deliberately creates no stub screen for
 * it, following the `APP5-A01` precedent (`/requests/{requestId}` was linked
 * one checkpoint before `APP5-A02` built it), because a placeholder detail is
 * a screen that exists without content.
 */
export const ADMIN_PRODUCTION_ROUTE = '/san-xuat';

/** The canonical detail address for one production job. `jobId` is a route key. */
export function adminProductionJobRoute(jobId: string): string {
  return `${ADMIN_PRODUCTION_ROUTE}/${jobId}`;
}
