import { CustomRequestQueueScreen } from '../../../features/custom-request-queue';

/**
 * `/requests` — the Admin custom-request queue (`APP5-A01`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the query, the filters and the
 * pagination.
 *
 * This segment does not prefetch, for the reason `APP3-A02` recorded: the
 * filters live in the URL and the queue is a keyset collection, so a
 * server-dehydrated first page would have to guess the filter set and would be
 * superseded by the client's own first request the moment the operator narrowed
 * it. `APP5-B04` marks the response `no-store` as well, which is a poor fit for
 * a dehydrated cache travelling in the HTML.
 */
export default function RequestsPage() {
  return <CustomRequestQueueScreen />;
}
