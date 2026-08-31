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
  // The canonical custom-request entry point (`APP5-S01`). On the shell
  // surface because the Homepage commission call to action targets the same
  // route the header IA item does; two literals for one path is how a second
  // intake flow starts by accident.
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  // The canonical public gallery route (`APP11-S02`). On the shell surface for
  // the same reason: the header IA item, the Homepage Collections action and
  // the feed's own route segment must all name one path, and `APP11-S03`
  // extends this family rather than introducing a second literal.
  STOREFRONT_GALLERY_ROUTE,
  // The section matcher behind the header's active state. Exported so a feature
  // that needs to reason about "am I inside this area" reuses the one rule the
  // header uses, instead of re-deriving prefix matching.
  isStorefrontNavRouteActive,
} from './model/storefront-navigation';
