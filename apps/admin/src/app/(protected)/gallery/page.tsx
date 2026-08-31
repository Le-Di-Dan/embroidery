import { GalleryListScreen } from '../../../features/gallery-list';

/**
 * `/gallery` — the Admin gallery list (`APP11-A01`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the query, the filter and the
 * continuation.
 *
 * This segment does not prefetch, for the reason `APP3-A02`, `APP5-A01` and
 * `APP8-A02` recorded: the filter lives in the URL and the list is a keyset
 * collection, so a server-dehydrated first page would have to guess the filter
 * and would be superseded by the client's own first request the moment the
 * operator narrowed it.
 *
 * `APP11-A02` adds `/gallery/[entryId]` beneath this segment. A01 deliberately
 * creates no placeholder for it: a detail screen with no content is worse than
 * a route that does not exist yet, and no control here addresses one.
 */
export default function GalleryPage() {
  return <GalleryListScreen />;
}
