/**
 * The Admin order routes, in one place.
 *
 * `/orders` and `/orders/{orderId}` are the two addresses `APP7-D01` §10
 * assigns, chosen to join the existing `(protected)` siblings (`assets`,
 * `products`, `requests`, `support`). The detail route belongs to the
 * `order-detail` capability; the queue only needs to *address* it, and it does
 * so through this function rather than by assembling a path in a row component
 * — one spelling, one place to change.
 *
 * The request address is `APP5-A01`'s, re-exported here for the same reason:
 * the queue and the order detail both link back to the custom request an order
 * was created from, and a second spelling of that path is a link that rots
 * silently when `APP5` moves it.
 */
export const ADMIN_ORDERS_ROUTE = '/orders';

/** The canonical detail address for one order. `orderId` is a route key. */
export function adminOrderDetailRoute(orderId: string): string {
  return `${ADMIN_ORDERS_ROUTE}/${orderId}`;
}
