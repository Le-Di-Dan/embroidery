/**
 * The reservations standing against one order — **display only** (`APP8-B03` §8.4).
 *
 * A read-only CTX-INV contract published so the Admin production detail can
 * report whether a Catalog-backed job has reservation backing. The contract is
 * Inventory's and is implemented against Inventory's own tables (TBL-021,
 * TBL-020); Production consumes it as a port, because
 * `BACKEND_CONVENTIONS.md` §10 forbids it from reading them directly.
 *
 * ### Why not `SKU_STOCK_REPOSITORY`
 *
 * That is the canonical AGG-07 **writer**: `adjust`, `createSoftHold`,
 * `convertHold`, `createReservation`, `release`, `consume`. A production read
 * surface that imported `InventoryModule` to list an order's reservations would
 * gain every one of them, and `APP8-B03` §13 forbids B03 from consuming or
 * releasing a reservation at all. One method that returns rows is what makes
 * that a property of the wiring rather than of the controller's restraint.
 *
 * It is also not a widening of the canonical contract: `SkuStockRepository` is
 * shared by `apps/api` and `apps/worker` since `APP8-B02`, and adding a read to
 * it would put a method on the worker's reservation writer that no worker path
 * calls.
 *
 * ### This read is NOT decision-grade
 *
 * `FU-APP8-B02-02` is explicit that a reservation read used to *decide*
 * something must hold the `sku_stocks` anchor lock (GRD-014), because an
 * unlocked read can observe a reservation a concurrent transaction is about to
 * release or consume. This method takes **no lock and opens no transaction**,
 * and it must never become the input to a start gate: `APP8-B04` owns
 * `GRD-015`, and it takes that decision under the anchor lock against rows it
 * read there. What this returns is what an operator sees on a screen, correct
 * as of the instant it was read and no longer.
 *
 * ### Every status, not only `RESERVED`
 *
 * A row that has been consumed or released is the more interesting one on a
 * production screen: it explains why a job that once had backing no longer
 * does. Filtering to `RESERVED` here would make a released reservation
 * indistinguishable from one that never existed.
 */
import type { InventoryReservationState } from '@embroidery/database';

export const ORDER_RESERVATION_SUMMARY_PORT = Symbol('ORDER_RESERVATION_SUMMARY_PORT');

/**
 * One reservation, named by the SKU an operator holds rather than by the anchor.
 *
 * `skuId` is joined from `sku_stocks` (1–1 with `skus`, CST-014) for the same
 * reason `APP8-B01`'s surface is keyed on the SKU: an operator holds SKU ids,
 * not stock-anchor ids. `skuStockId` travels beside it because it is the
 * identity half of `CST-016`'s `(order_id, sku_stock_id)` arbiter, and an
 * operator reconciling two reservations needs to see which anchor each is on.
 *
 * No customer, no request, no ledger entry and no availability figure: this
 * says what is committed against the order, not what the SKU's stock looks like.
 */
export interface OrderReservationRow {
  readonly reservationId: string;
  readonly skuStockId: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly status: InventoryReservationState;
}

export interface OrderReservationSummaryPort {
  /**
   * Every reservation ever placed against the order, in a stable order.
   *
   * Empty for an order that has none — which for a COP-only order is the
   * expected, correct answer and never an error (`APP8-G01` `PO-APP8-001` §1.3).
   */
  listForOrder(orderId: string): Promise<OrderReservationRow[]>;
}
