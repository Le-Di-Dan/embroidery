/**
 * Order-origin fact port (`APP12-DB01` `COL-TBL043-12`, `BR-031`).
 *
 * One fact, for one consumer: `ReservationEligibilityGuard` has to know which
 * of the two order shapes it is being asked to reserve against, because
 * `GRD-013`'s deposit precondition is a **custom-commerce** rule and a
 * Ready-Made order has no deposit obligation at any point in its life
 * (`BR-029`).
 *
 * A **port**, for the same reason `DEPOSIT_ELIGIBILITY_PORT` is one:
 * `BACKEND_CONVENTIONS.md` §10 forbids Inventory from reading the Ordering
 * module's tables, and this keeps the direction of the dependency honest —
 * Inventory depends on the interface, Ordering provides the implementation.
 *
 * It publishes the discriminator and nothing else. Not the status, not the
 * customer, not the total: a guard that could read the whole order row would
 * start deciding questions that belong to the order's own writer.
 */
import type { OrderOrigin } from '@embroidery/database';

export const ORDER_ORIGIN_PORT = Symbol('ORDER_ORIGIN_PORT');

export interface OrderOriginPort {
  /**
   * The order's immutable origin, or `undefined` when no such order exists.
   *
   * `tg_orders__origin_immutable` makes the answer stable for the life of the
   * row, which is what lets a caller read it without a lock.
   */
  originOf(orderId: string): Promise<OrderOrigin | undefined>;
}
