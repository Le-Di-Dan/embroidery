/**
 * Release isolation (`APP12-G02`) — the Storefront half of the Wave-2 gate.
 *
 * The public surface is deliberately two values: the policy question and the
 * route list that answers it. The gate itself lives in `src/proxy.ts`, where
 * the framework requires it.
 */
export {
  SECURE_ACCESS_LANDING_ROUTE,
  WITHHELD_WAVE2_ROUTES,
  WITHHELD_WAVE2_ROUTE_COUNT,
  isWithheldWave2Route,
} from './model/wave2-route-policy';
export { isCustomerRouteWithheld } from './model/withheld-route-state';
