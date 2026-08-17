// Public surface of the custom-request-queue feature. The route file and the
// Admin shell navigation import from here only; components, hooks, services and
// model stay encapsulated.
export { CustomRequestQueueScreen } from './components/custom-request-queue-screen';
export {
  ADMIN_REQUESTS_ROUTE,
  adminCustomRequestDetailRoute,
} from './model/custom-request-queue-route';
export { CUSTOM_REQUEST_QUEUE_COPY } from './model/custom-request-queue-copy';
/**
 * The queue cache identity, published for `APP5-A02`.
 *
 * A moderation transition changes which requests belong in triage, so A02 must
 * invalidate the same root this feature reads under — not a literal of its own.
 * Two spellings of one cache key is how an invalidation silently stops matching.
 */
export { customRequestQueueKeys } from './model/custom-request-queue-keys';
