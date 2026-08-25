// Public surface of the production-queue feature (`APP8-A02`). The route file
// and the Admin shell navigation import from here only; components, hooks,
// services and model stay encapsulated.
export { ProductionQueueScreen } from './components/production-queue-screen';
export { ADMIN_PRODUCTION_ROUTE, adminProductionJobRoute } from './model/production-queue-route';
export { PRODUCTION_QUEUE_COPY } from './model/production-queue-copy';
/**
 * The queue cache identity, published for the capability that will invalidate
 * it. `APP8-A03`'s transitions move a job between LC-18 states, which changes
 * which jobs belong in a status-filtered queue, so the detail screen must
 * invalidate the same root this feature reads under — not a literal of its own.
 * Two spellings of one cache key is how an invalidation silently stops matching
 * and an operator returns to a queue still listing work they finished.
 */
export { productionQueueKeys } from './model/production-queue-keys';
