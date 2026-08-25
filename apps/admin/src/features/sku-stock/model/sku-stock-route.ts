/**
 * The Admin SKU stock route, as `APP8-D01` fixes it (`775:3` breadcrumb
 * `Quản trị / Kho / SKU`, route identity `/kho/skus/{skuId}`).
 *
 * There is **no** parameterless `/kho` destination and this module publishes
 * none. `APP8-B01` exposes stock **by SKU** and deliberately ships no all-SKU
 * availability query, so a route that listed every SKU's stock would be a
 * screen with no operation behind it. The capability therefore starts from a
 * known `skuId` and is reached from a surface that already holds one.
 */

/** `/kho/skus/{skuId}` — the only Admin inventory destination in APP8. */
export function adminSkuStockRoute(skuId: string): string {
  return `/kho/skus/${encodeURIComponent(skuId)}`;
}
