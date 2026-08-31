import { GalleryCreateAction } from '../../../features/gallery-editor';
import { GalleryListScreen } from '../../../features/gallery-list';

/**
 * `/gallery` — the Admin gallery list (`APP11-A01`), with the create action
 * `APP11-A02` restored to it.
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, the list owns the query, the filter and the continuation,
 * and the editor owns creation. This file holds no query, no state and no
 * operation — it composes the two capabilities.
 *
 * Composing them *here* is what keeps the dependency between them pointing one
 * way. The editor knows the list's route helper and cache root; the list takes
 * the create action as an opaque node and knows nothing about the editor, so
 * the two feature barrels never import each other.
 *
 * This segment does not prefetch, for the reason `APP3-A02`, `APP5-A01` and
 * `APP8-A02` recorded: the filter lives in the URL and the list is a keyset
 * collection, so a server-dehydrated first page would have to guess the filter
 * and would be superseded by the client's own first request the moment the
 * operator narrowed it.
 */
export default function GalleryPage() {
  return <GalleryListScreen createAction={<GalleryCreateAction />} />;
}
