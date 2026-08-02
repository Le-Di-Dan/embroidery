// Public surface of the product-discovery feature. The `/kham-pha` route
// segment imports from here only; components, hooks and services stay
// encapsulated behind it.
export { DiscoverIntro } from './components/discover-intro';
export { DiscoverCategoryNav } from './components/discover-category-nav';
export { DiscoverFeedScreen } from './components/discover-feed-screen';
export { DiscoverQueryProvider } from './components/discover-query-provider';

export { DISCOVER_ROUTE, DISCOVER_CATEGORY_QUERY_KEY } from './model/discover-route';
export { DISCOVER_COPY } from './model/discover-copy';
export { discoverQueryKeys } from './model/discover-query-keys';
export { nextCursorOf } from './model/discover-feed';
export { resolveDiscoverSelection, selectionSlug } from './model/discover-selection';
export type { DiscoverSelection, DiscoverSearchParams } from './model/discover-selection';
export type { DiscoverCategorySlug } from './model/discover-categories';

// `services/discover-catalog.server` is deliberately NOT re-exported here. It
// reaches for `INTERNAL_API_BASE_URL`, which is server-only; routing it through
// the same barrel the client components use would put that module on a path the
// bundler can follow into the browser. The route segment deep-imports it
// instead, exactly as the Admin product list does.
