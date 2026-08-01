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
} from './model/product-route';
export { PRODUCT_COPY } from './model/product-copy';
export { PRODUCT_FORM_COPY } from './model/product-form-copy';
export { productQueryKeys, PRODUCT_LIST_PAGE_SIZE } from './model/product-query-keys';
export { normalizeProductFilters, type ProductFilters } from './model/product-filters';

// The server-only prefetch service is deliberately NOT re-exported here: it
// imports `next/headers`, and this module is reachable from Client Components.
// The route segment imports it directly instead.
