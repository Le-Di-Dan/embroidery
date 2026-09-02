/**
 * The public surface of the Ready-Made checkout feature (`APP12-S02`).
 *
 * The `/mua-hang/[slug]` route segment imports from here only; the model, the
 * hooks, the API module and every card stay encapsulated behind it.
 *
 * Two things are deliberately **not** on this boundary:
 *
 * - `api/ready-made-order.client` — the one write. Exporting it would make the
 *   order-creation command reachable from anywhere in the app, and there is
 *   exactly one screen that may issue it.
 * - `services/ready-made-checkout.server` — it reaches `INTERNAL_API_BASE_URL`
 *   through the server Axios client, which is server-only. Routing it through
 *   the same barrel the client island uses would put that module on a path the
 *   bundler can follow into the browser. The route segment deep-imports it,
 *   exactly as `/san-pham/[slug]` does for its own reads.
 */
export { CheckoutQueryProvider } from './ui/checkout-query-provider';
export { READY_MADE_CHECKOUT_COPY } from './model/ready-made-checkout-copy';
export type { ReadyMadeCheckoutView } from './model/checkout-view';
export {
  CHECKOUT_QUANTITY_PARAM,
  CHECKOUT_SKU_PARAM,
  readQueryHint,
  resolveCheckoutSelection,
} from './model/checkout-selection';
export type {
  CheckoutSelection,
  CheckoutSelectionRefusal,
  CheckoutSelectionResult,
} from './model/checkout-selection';
