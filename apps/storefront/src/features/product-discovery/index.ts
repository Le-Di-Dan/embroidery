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
export { DISCOVER_COPY, discoverCategoryTitle } from './model/discover-copy';
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
// The category chip model (`APP12-C01-C1`). A `DiscoverCategory` is a row from
// `GET /api/public/categories`, never a compiled value — the type is the
// contract's own item type, aliased. No slug list crosses this boundary any
// more, because there is no longer one to export: `DISCOVER_CATEGORY_SLUGS` and
// `toDiscoverCategorySlug` were a second taxonomy and are gone.
export type { DiscoverCategory, DiscoverChip } from './model/discover-categories';
export {
  toDiscoverChips,
  isKnownCategory,
  findDiscoverCategory,
} from './model/discover-categories';
// Slug **shape**, which is a rule this app owns, unlike the slug **values**,
// which it does not. Product Detail uses it to reject a malformed category on a
// Product response before building an href from it.
export { isCategorySlugShape, CATEGORY_SLUG_PATTERN } from './model/category-slug-shape';

// `services/discover-catalog.server` is deliberately NOT re-exported here. It
// reaches for `INTERNAL_API_BASE_URL`, which is server-only; routing it through
// the same barrel the client components use would put that module on a path the
// bundler can follow into the browser. The route segment deep-imports it
// instead, exactly as the Admin product list does.
