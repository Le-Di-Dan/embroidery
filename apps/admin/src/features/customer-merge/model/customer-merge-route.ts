/**
 * The two routes this capability owns (`APP10-A02`).
 *
 * Both are **sub-routes of the existing** `/support/customer-access` entry, not
 * a section of their own: `resolveNavItemState` already answers `'section'` for
 * anything under `…/customer-access/`, so the approved shell keeps the support
 * entry lit and reachable and APP10 adds **zero** sidenav items. That is why the
 * base is imported from the support capability rather than re-spelled — a second
 * literal is how a nav entry and its destination drift apart.
 *
 * The selection route carries **no parameter and no query string**. Both
 * participants are resolved inside the screen from contacts submitted in request
 * bodies, so no contact ever reaches browser history, the gateway access log or
 * a `Referer` header.
 *
 * The case route carries the merge case id and nothing else. It is an opaque
 * server-generated identifier that grants nothing on its own — `APP10-B02`
 * re-checks the Admin session on every request — and it is the whole input the
 * detail screen needs, which is what makes a direct visit or a refresh work
 * without any state from the selection screen.
 */
import { ADMIN_CUSTOMER_ACCESS_ROUTE } from '../../customer-access-support';

export const ADMIN_CUSTOMER_MERGE_ROUTE = `${ADMIN_CUSTOMER_ACCESS_ROUTE}/merge`;

export function adminCustomerMergeCaseRoute(mergeCaseId: string): string {
  return `${ADMIN_CUSTOMER_MERGE_ROUTE}/${mergeCaseId}`;
}
