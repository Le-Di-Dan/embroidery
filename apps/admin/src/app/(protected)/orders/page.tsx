import { OrderQueueScreen } from '../../../features/order-queue';

/**
 * `/orders` — the Admin order queue (`APP7-A01`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the query, the filter and the
 * pagination.
 *
 * This segment does not prefetch, for the reason `APP3-A02` recorded and
 * `APP5-A01` repeated: the filter lives in the URL and the queue is a keyset
 * collection, so a server-dehydrated first page would have to guess the filter
 * set and would be superseded by the client's own first request the moment the
 * operator narrowed it.
 */
export default function OrdersPage() {
  return <OrderQueueScreen />;
}
