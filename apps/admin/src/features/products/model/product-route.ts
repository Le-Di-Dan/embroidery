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

/** Create mode (`521:284` — Tạo: /products/new). */
export const ADMIN_PRODUCT_NEW_ROUTE = `${ADMIN_PRODUCTS_ROUTE}/new`;

/**
 * Edit/detail for one product. The segment is the B02 product **UUID**, never
 * the public slug: the slug is a storefront address, and using it as the Admin
 * identity would break the moment slugs are ever allowed to change.
 */
export function adminProductDetailRoute(productId: string): string {
  return `${ADMIN_PRODUCTS_ROUTE}/${encodeURIComponent(productId)}`;
}

/**
 * The publication interaction for one product (`APP2-A04`).
 *
 * A child of the detail route, not a sibling `/publish/*` or `/catalog/*`
 * branch: publication is one more thing you do to a product you are already
 * looking at, and nesting it keeps the product UUID the single identity in the
 * path. As with detail, the segment is the UUID and never the public slug.
 */
export function adminProductPublicationRoute(productId: string): string {
  return `${adminProductDetailRoute(productId)}/publication`;
}

/**
 * Placement authoring for one product (`APP3-A01`).
 *
 * A child of the detail route for the same reason publication is: placement is
 * one more thing you do to a product you are already looking at, and nesting
 * keeps the product UUID the single identity in the path. The route lives here
 * rather than in the placement feature so the product route family has exactly
 * one owner — and so the detail screen can link to placement without the two
 * features importing each other.
 */
export function adminProductPlacementRoute(productId: string): string {
  return `${adminProductDetailRoute(productId)}/placement`;
}
