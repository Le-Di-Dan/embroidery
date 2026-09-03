// Public surface of the products feature. The route file and the Admin shell
// navigation import from here only; components, hooks, services and model stay
// encapsulated.
export { ProductListScreen } from './components/product-list-screen';
export { ProductCreateScreen } from './components/product-create-screen';
export { ProductDetailScreen } from './components/product-detail-screen';
export { ProductPublicationScreen } from './components/product-publication-screen';
export {
  ADMIN_PRODUCTS_ROUTE,
  ADMIN_PRODUCT_NEW_ROUTE,
  adminProductDetailRoute,
  adminProductPublicationRoute,
  adminProductPlacementRoute,
} from './model/product-route';
// The authoritative product record. Exported because APP3-A01 renders the
// product's name at the root of its Product → Side → Area hierarchy, and the
// placement contract carries only the product **id**. Reusing this accepted
// read is what keeps a UUID out of a heading; it adds no API operation.
export { useProductDetailQuery } from './hooks/use-product-detail-query';
export { PRODUCT_COPY } from './model/product-copy';
export { PRODUCT_FORM_COPY } from './model/product-form-copy';
export { productQueryKeys, PRODUCT_LIST_PAGE_SIZE } from './model/product-query-keys';
export {
  normalizeProductFilters,
  toFilterSearchString,
  type ProductFilters,
} from './model/product-filters';

// The server-only prefetch service is deliberately NOT re-exported here: it
// imports `next/headers`, and this module is reachable from Client Components.
// The route segment imports it directly instead.
