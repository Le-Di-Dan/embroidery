// Public surface of the gallery-feed feature. The `/bo-suu-tap` route segment
// imports from here only; components, hooks and services stay encapsulated
// behind it.
export { GalleryIntro } from './components/gallery-intro';
export { GalleryFeedScreen } from './components/gallery-feed-screen';
export { GalleryQueryProvider } from './components/gallery-query-provider';

export { GALLERY_ROUTE } from './model/gallery-route';
export { GALLERY_COPY } from './model/gallery-copy';
export { galleryQueryKeys } from './model/gallery-query-keys';
export { nextGalleryCursorOf } from './model/gallery-feed';

// `services/gallery-feed.server` is deliberately NOT re-exported here. It
// reaches for `INTERNAL_API_BASE_URL`, which is server-only; routing it through
// the same barrel the client components use would put that module on a path the
// bundler can follow into the browser. The route segment deep-imports it
// instead, exactly as `/kham-pha` does.
