// Public surface of the order-queue feature (`APP7-A01`). The route file and
// the Admin shell navigation import from here only; components, hooks, services
// and model stay encapsulated.
export { OrderQueueScreen } from './components/order-queue-screen';
export { ADMIN_ORDERS_ROUTE, adminOrderDetailRoute } from './model/order-queue-route';
export { ORDER_QUEUE_COPY } from './model/order-queue-copy';
/**
 * The queue cache identity, published for the order-detail capability.
 *
 * A successful deposit verification moves the order to `DEPOSIT_PAID`, which
 * changes which orders belong in a status-filtered queue, so the detail screen
 * must invalidate the same root this feature reads under — not a literal of its
 * own. Two spellings of one cache key is how an invalidation silently stops
 * matching and an operator returns to a queue still listing work they finished.
 */
export { orderQueueKeys } from './model/order-queue-keys';
