/**
 * AGG-15 Order persistence contract — re-exported from its shared home
 * (`APP7-W01-C1`).
 *
 * The contract and its Drizzle implementation now live in
 * `@embroidery/persistence` (`src/order/`), because `APP7-W01` needs the worker
 * to create orders and an application may not import another application. The
 * defect the correction removed was a *second* implementation; the fix is one
 * implementation with two consumers.
 *
 * This file is a re-export and holds no logic: every delivered import of
 * `order.repository` — the module, the three AGG-15 suites, the DB9 benchmarks
 * and the DB10 durability suite — resolves the same symbols it always did, and
 * `ORDER_REPOSITORY` is the **same Symbol instance**, so no injection token was
 * split in two.
 *
 * The behaviour it describes is unchanged from DB7: G-DB7-05 (the whole
 * request → quotation → approval chain resolves to one root), G-DB7-21
 * (GRD-009), G-DB7-24, G-DB7-25, G-DB7-37, and the canonical `order.created`
 * append (SE-006 / G-DB7-54) inside the creating transaction.
 */
export { ORDER_REPOSITORY } from '@embroidery/persistence';
export type {
  AcknowledgeShippingFeeInput,
  CreateOrderInput,
  Order,
  OrderId,
  OrderItem,
  OrderRepository,
  OrderTransition,
  SaveShippingDetailInput,
  ShippingDetail,
  TransitionOrderInput,
} from '@embroidery/persistence';
