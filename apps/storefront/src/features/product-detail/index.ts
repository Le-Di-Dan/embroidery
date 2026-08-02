// Public surface of the product-detail feature. The `/san-pham/[slug]` route
// segment imports from here only; components, hooks and model stay encapsulated
// behind it.
export { ProductDetailScreen } from './components/product-detail-screen';
export { DetailLoading } from './components/detail-loading';
export { DetailError } from './components/detail-error';

export { PRODUCT_DETAIL_COPY } from './model/product-detail-copy';
export { toProductDetailView } from './model/product-detail-view';
export type { ProductDetailView, ProductDetailMedia } from './model/product-detail-view';

// `services/product-detail.server` is deliberately NOT re-exported here. It
// reaches for `INTERNAL_API_BASE_URL` through the server Axios client, which is
// server-only; routing it through the same barrel the client islands use would
// put that module on a path the bundler can follow into the browser. The route
// segment deep-imports it instead, exactly as `/kham-pha` does.
