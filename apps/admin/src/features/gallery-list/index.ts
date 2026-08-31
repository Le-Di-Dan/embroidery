// Public surface of the gallery-list feature (`APP11-A01`). The route file and
// the Admin shell navigation import from here only; components, hooks, services
// and model stay encapsulated.
export { GalleryListScreen } from './components/gallery-list-screen';
export { ADMIN_GALLERY_ROUTE, adminGalleryEntryRoute } from './model/gallery-list-route';
export { GALLERY_LIST_COPY } from './model/gallery-list-copy';
/**
 * The list cache identity, published for the capability that will invalidate
 * it. `APP11-A02`'s create, update, publish and unpublish each change which
 * entries belong in a status-filtered list and where they sit in
 * `display_order`, so the editor must invalidate the same root this feature
 * reads under — not a literal of its own. Two spellings of one cache key is how
 * an invalidation silently stops matching and an operator returns to a list
 * still showing the entry they just archived.
 */
export { galleryListKeys } from './model/gallery-list-keys';
