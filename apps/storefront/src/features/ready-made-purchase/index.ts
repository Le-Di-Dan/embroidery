// Public surface of the ready-made-purchase feature (`APP12-S01`). The Product
// Detail screen composes the panel through here; the model, the option and
// stepper components and the copy stay encapsulated behind it.
export { ReadyMadePurchasePanel } from './components/ready-made-purchase-panel';
export type { ReadyMadePurchasePanelProps } from './components/ready-made-purchase-panel';

// The projection type crosses the boundary because the route segment performs
// the server read and hands the result to the panel as a prop. Nothing else
// about the model does.
export type { ReadyMadePurchaseResult } from './model/purchase-projection';

// `services/ready-made-purchase.server` is deliberately NOT re-exported here,
// for the reason `product-detail/index.ts` records: it reaches
// `INTERNAL_API_BASE_URL` through the server Axios client, which is server-only,
// and routing it through the barrel a client island imports would put that
// module on a path the bundler can follow into the browser. The route segment
// deep-imports it instead.
