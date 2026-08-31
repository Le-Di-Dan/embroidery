// Public surface of the product-discovery feature. The `/kham-pha` route
// segment imports from here only; components, hooks and services stay
// encapsulated behind it.
export { DiscoverIntro } from './components/discover-intro';
export { DiscoverCategoryNav } from './components/discover-category-nav';
export { DiscoverFeedScreen } from './components/discover-feed-screen';
export { DiscoverQueryProvider } from './components/discover-query-provider';

// `buildDiscoverHref` is on the public surface because Product Detail links back
// into Discover (breadcrumb + continuation). One builder means the detail page
// and the Discover chips can never disagree about how a category is addressed.
export {
  DISCOVER_ROUTE,
  DISCOVER_CATEGORY_QUERY_KEY,
  buildDiscoverHref,
} from './model/discover-route';
export { DISCOVER_COPY } from './model/discover-copy';
export { discoverQueryKeys } from './model/discover-query-keys';
export { nextCursorOf } from './model/discover-feed';
// The public-product card projection. Exposed for the Homepage's Featured
// Works and Discover preview (`APP11-S01`), so the Storefront keeps exactly one
// boundary at which `price` and `isDisplayOutOfStock` are dropped from a public
// product summary — a second projection would be a second place for a commerce
// field to leak into an image-led surface.
export { toDiscoverCard } from './model/discover-feed';
export type { DiscoverCard } from './model/discover-feed';
export { resolveDiscoverSelection, selectionSlug } from './model/discover-selection';
export type { DiscoverSelection, DiscoverSearchParams } from './model/discover-selection';
export type { DiscoverCategorySlug } from './model/discover-categories';
// The four contract slugs as a **value**, for `APP11-S04`: the sitemap must
// advertise every canonical category state, and deriving them from the contract
// enum — the same source the chips use — means a contract change is a build
// failure rather than a sitemap entry that silently 404s.
export { DISCOVER_CATEGORY_SLUGS } from './model/discover-categories';
// The canonical membership test, for `APP11-S04-C1`. A Product carries a
// Catalog category slug, and nothing constrains that to be one of the four
// Discover filters — so Product Detail must be able to ask, with the same
// narrowing `/kham-pha` applies to a `?category=` value, whether a slug names
// a state this route will actually render. One predicate means a breadcrumb
// can never link to a filter the feed answers with its not-found boundary.
export { toDiscoverCategorySlug } from './model/discover-categories';

// `services/discover-catalog.server` is deliberately NOT re-exported here. It
// reaches for `INTERNAL_API_BASE_URL`, which is server-only; routing it through
// the same barrel the client components use would put that module on a path the
// bundler can follow into the browser. The route segment deep-imports it
// instead, exactly as the Admin product list does.
