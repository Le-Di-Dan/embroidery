// Public surface of the gallery-detail feature. The `/bo-suu-tap/[slug]` route
// segment imports from here only; components, hooks and model stay encapsulated
// behind it.
export { GalleryDetailScreen } from './components/gallery-detail-screen';
export { GalleryDetailLoading } from './components/gallery-detail-loading';
export { GalleryDetailError } from './components/gallery-detail-error';

export { GALLERY_DETAIL_COPY } from './model/gallery-detail-copy';
export { toGalleryDetailView } from './model/gallery-detail-view';
export type {
  GalleryDetailView,
  GalleryDetailMedia,
  GalleryDetailLinkedProduct,
} from './model/gallery-detail-view';
export { isPublicGalleryEntrySlug } from './model/gallery-detail-slug';

// `services/gallery-detail.server` is deliberately NOT re-exported here. It
// reaches for `INTERNAL_API_BASE_URL` through the server Axios client, which is
// server-only; routing it through the same barrel the client islands use would
// put that module on a path the bundler can follow into the browser. The route
// segment deep-imports it instead, exactly as `/san-pham/[slug]` does.
