/**
 * The one canonical route this capability owns.
 *
 * `APP4-A01` fixes it, and `APP4-G01` locked the slug. Declared here so the
 * route file, the shell navigation and any checker read one spelling — a second
 * literal elsewhere is how a nav entry and its destination drift apart.
 *
 * It carries **no path or query parameter**. The Customer is resolved inside the
 * screen from a contact submitted in a request body, so there is no id in the
 * URL and — more importantly — no contact in one. A `?contact=` or
 * `?customerId=` here would put support subjects in browser history, the
 * gateway's access log and every `Referer` the page sends.
 */
export const ADMIN_CUSTOMER_ACCESS_ROUTE = '/support/customer-access';
