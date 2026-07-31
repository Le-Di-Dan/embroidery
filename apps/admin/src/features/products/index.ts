// Public surface of the products feature. The route file and the Admin shell
// navigation import from here only; components, hooks, services and model stay
// encapsulated.
export { ProductListScreen } from './components/product-list-screen';
export { ADMIN_PRODUCTS_ROUTE } from './model/product-route';
export { PRODUCT_COPY } from './model/product-copy';
export { productQueryKeys, PRODUCT_LIST_PAGE_SIZE } from './model/product-query-keys';
export { normalizeProductFilters, type ProductFilters } from './model/product-filters';

// The server-only prefetch service is deliberately NOT re-exported here: it
// imports `next/headers`, and this module is reachable from Client Components.
// The route segment imports it directly instead.
