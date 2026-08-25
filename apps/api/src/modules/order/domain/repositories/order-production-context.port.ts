/**
 * The order facts a production job is cut from, and nothing else (`APP8-B03` §5.3).
 *
 * A **read-only** Ordering contract beside {@link OrderRepository},
 * `AdminOrderReadRepository` and `OrderDepositContextPort`, published for the
 * reason all three of those were: CTX-PRD needs to reach two Ordering facts and
 * `BACKEND_CONVENTIONS.md` §10 forbids it from reading Ordering's tables. The
 * contract is Ordering's, implemented against Ordering's own tables (TBL-043,
 * TBL-044); Production consumes it as a port.
 *
 * ### Why this and not one of the three that already exist
 *
 * `ORDER_REPOSITORY` is the AGG-15 **writer** — `createFromAcceptedQuotation`,
 * `transition`, `dispatch`, `openCancellationRequest`. A production surface that
 * imported it to learn an approval id would gain an LC-14 transition in the same
 * injector, and `APP8-B03` §13 forbids B03 from moving an order at all.
 *
 * `AdminOrderReadRepository` carries the frozen line items, the customer id and
 * the money. `OrderDepositContextPort` returns `id`/`code`/`status` and has no
 * approval reference at all. Neither answers the one question creation asks.
 *
 * ### `currentApprovalSnapshotId` is the linkage, not a lookup key
 *
 * `orders.current_approval_snapshot_id` is `NOT NULL` (REL-074) and is the
 * order's own audited pointer to the approval it is being produced against. A
 * job created from *this* value cannot be cut from artwork approved for a
 * different order, because the value was read off the order row itself — which
 * is the "exact order ↔ approval-snapshot linkage" `APP8-B03` §5.3 requires and
 * strictly stronger than proving the two rows independently exist.
 *
 * ### `status` is deliberately absent
 *
 * `GRD-015`'s `DEPOSIT_PAID` clause and `GRD-022`'s hold/cancelling clause are
 * **production-start** gates and belong to `APP8-B04` (§5.6). Publishing the
 * order state here would put the raw material of a start decision inside a
 * creation path that must not take one. `APP8-B04` may extend this port when it
 * owns that gate.
 *
 * ### The subject counts, and what they are for
 *
 * `catalogItemCount`/`customerOwnedItemCount` are counts over the stored XOR
 * `ck_order_items__exactly_one_subject`. They exist so the detail read can say
 * *truthfully* that a COP-only order has no reservation requirement
 * (`APP8-G01` `PO-APP8-001` §1.3) rather than reporting an empty reservation
 * list that looks like missing coverage. They are counts, not ids: a production
 * screen never needs to enumerate the commercial lines, and `APP7-B02`'s Admin
 * order detail already publishes those for the operator who does.
 */

export const ORDER_PRODUCTION_CONTEXT_PORT = Symbol('ORDER_PRODUCTION_CONTEXT_PORT');

export interface OrderProductionContext {
  readonly orderId: string;
  readonly code: string;
  /** REL-074, `NOT NULL` — the approval this order is produced against. */
  readonly currentApprovalSnapshotId: string;
  /** Lines naming a Catalog SKU. Zero means the order is COP-only. */
  readonly catalogItemCount: number;
  /** Lines naming a customer-owned product (INV-13 — never a SKU). */
  readonly customerOwnedItemCount: number;
}

export interface OrderProductionContextPort {
  /**
   * The production context of one order, or nothing.
   *
   * Never throws for absence: the caller decides what an unknown order means on
   * its own surface. On the Admin production surface that is a `404`, because
   * the caller is an authenticated operator who typed the id.
   */
  findByOrderId(orderId: string): Promise<OrderProductionContext | undefined>;
}
