/**
 * The single canonical route for the Admin product list, owned by this
 * capability. The shell navigation and the route segment both read it, so there
 * is exactly one spelling and no `/admin/products`, `/catalog` or `/san-pham`
 * alias. Neutral module (no `server-only`) — the client navigation imports it.
 *
 * `APP2-A03` adds the product form/detail routes beneath this segment; nothing
 * links to them until they exist.
 */
export const ADMIN_PRODUCTS_ROUTE = '/products';
