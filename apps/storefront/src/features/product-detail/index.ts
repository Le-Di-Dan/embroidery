// Public surface of the product-detail feature. The `/san-pham/[slug]` route
// segment imports from here only; components, hooks and model stay encapsulated
// behind it.
export { ProductDetailScreen } from './components/product-detail-screen';
export { DetailLoading } from './components/detail-loading';
export { DetailError } from './components/detail-error';

export { PRODUCT_DETAIL_COPY } from './model/product-detail-copy';
// The one resolved breadcrumb trail (`APP11-S04-C1`). On the public surface
// because it has two consumers that must not diverge: the rendered `<nav>`
// inside this feature, and the `BreadcrumbList` JSON-LD the route segment
// emits. Rebuilding the sequence in the segment is what let a category crumb
// pointing at an invalid Discover filter reach both at once.
export { resolveProductBreadcrumb } from './model/product-breadcrumb';
export type { ProductBreadcrumbItem, ProductBreadcrumbSubject } from './model/product-breadcrumb';
export { toProductDetailView } from './model/product-detail-view';
export type { ProductDetailView, ProductDetailMedia } from './model/product-detail-view';

// `services/product-detail.server` is deliberately NOT re-exported here. It
// reaches for `INTERNAL_API_BASE_URL` through the server Axios client, which is
// server-only; routing it through the same barrel the client islands use would
// put that module on a path the bundler can follow into the browser. The route
// segment deep-imports it instead, exactly as `/kham-pha` does.
