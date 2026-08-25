// Public surface of the SKU stock feature (`APP8-A01`). The route file imports
// the screen from here; components, hooks, services and model stay
// encapsulated.
//
// The adjustment service is deliberately **not** on this boundary. It is the
// only operation in APP8 that moves `quantityOnHand`, it carries no idempotency
// key, and anything that could reach it from outside this feature would be an
// audited stock movement with no approved control behind it. It is reached
// through the dialog or not at all.
export { SkuStockScreen } from './components/sku-stock-screen';
export { adminSkuStockRoute } from './model/sku-stock-route';
export { SKU_STOCK_COPY } from './model/sku-stock-copy';
