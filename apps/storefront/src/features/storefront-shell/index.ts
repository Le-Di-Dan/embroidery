// Public surface of the storefront-shell feature. The root layout imports from
// here only; internal components/hooks/model stay encapsulated.
export { StorefrontShell } from './components/storefront-shell';

// The canonical Storefront home route is shell IA (the brand link targets it).
// Exposed so sibling features reuse the single source of truth instead of
// re-hard-coding the path (e.g. the 404 boundary's primary recovery, APP1-S01B).
export {
  STOREFRONT_HOME_ROUTE,
  STOREFRONT_DISCOVER_ROUTE,
  STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE,
  STOREFRONT_STUDIO_ROUTE_SEGMENT,
  buildStorefrontProductDetailPath,
  buildStorefrontStudioPath,
} from './model/storefront-navigation';
