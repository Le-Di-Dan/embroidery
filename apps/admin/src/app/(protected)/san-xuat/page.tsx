import { ProductionQueueScreen } from '../../../features/production-queue';

/**
 * `/san-xuat` — the Admin production queue (`APP8-A02`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the query, the filters and the
 * pagination.
 *
 * This segment does not prefetch, for the reason `APP3-A02` recorded and
 * `APP5-A01`/`APP7-A01` repeated: the filters live in the URL and the queue is a
 * keyset collection, so a server-dehydrated first page would have to guess the
 * filter set and would be superseded by the client's own first request the
 * moment the operator narrowed it.
 *
 * No `/san-xuat/{jobId}` segment is created here. The rows address it, but the
 * detail screen is `APP8-A03`'s to build — a stub would be a screen that exists
 * without content.
 */
export default function ProductionQueuePage() {
  return <ProductionQueueScreen />;
}
