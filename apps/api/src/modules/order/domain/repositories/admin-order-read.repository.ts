/**
 * The Admin order read model (`APP7-B02` §10).
 *
 * A **query** contract, deliberately separate from `OrderRepository`. That one
 * is AGG-15's canonical writer — it creates the order under GRD-009, moves it
 * through LC-14 and freezes shipping at dispatch — and it now lives in
 * `@embroidery/persistence` because the worker creates orders too
 * (`APP7-W01-C1`). Folding a queue projection into it would put an Admin list
 * shape inside the aggregate every write path resolves, and would hand a read
 * route a `transition()` it must never call.
 *
 * So this is a second seam, not a second authority. It reads; it has no
 * `create`, no `transition`, no outbox append and no chain guard, and it never
 * opens a transaction.
 *
 * ### Frozen facts only
 *
 * Every row below is a column of `orders` or `order_items` — the values W01
 * froze at creation. No live Catalog row supplies a name, a label, a size or a
 * price, and no current pointer (`design_cases.current_version_id`,
 * `custom_requests.current_quotation_id`, the latest quotation version) is
 * consulted. `product_name`, `variant_label` and `size_label` are `order_items`
 * columns, not a `products`/`product_variants` join, which is why an Admin
 * screen keeps showing what the customer approved after Catalog is renamed.
 *
 * Money is carried as the string the driver returns for `numeric(14,2)`.
 * Nothing here multiplies, sums, rounds or re-derives a deposit: the persisted
 * amounts *are* the commercial truth (`APP7-B02` §4).
 */
import type { OrderOrigin, OrderState } from '@embroidery/database';

/** The keyset position of the last row of the previous page. */
export interface AdminOrderQueuePosition {
  readonly createdAt: Date;
  readonly id: string;
}

export interface AdminOrderQueueFilter {
  /** Absent means "every state", not a default subset — B02 invents no triage set. */
  readonly statuses: readonly OrderState[] | undefined;
  /**
   * Absent means "every origin" (`APP12-A02-C1`).
   *
   * Applied in SQL against `orders.origin`, the immutable `COL-TBL043-12`
   * discriminator, so a filtered page is a page the database built. Filtering
   * rows after a keyset page is fetched would return short pages and a cursor
   * that skips whatever the predicate removed.
   */
  readonly origins: readonly OrderOrigin[] | undefined;
}

export interface AdminOrderQueueQuery {
  readonly filter: AdminOrderQueueFilter;
  readonly after: AdminOrderQueuePosition | undefined;
  /** Already clamped by `resolveLimit`; the adapter over-fetches by one. */
  readonly limit: number;
}

/**
 * The smallest order-owned set that identifies and triages one order.
 *
 * ### The custom chain is optional, and `origin` says when (`APP12-A02-C1`)
 *
 * `ck_orders__custom_chain_by_origin` makes `custom_request_id` `NOT NULL` on a
 * `CUSTOM` row and `NULL` on a `READY_MADE` one — the database decides, not a
 * caller. So the field is optional here and `origin` is the discriminator that
 * tells a consumer which of the two shapes it is holding, on the
 * `OrderLifecycle` precedent `APP12-B05` set for the write side.
 *
 * Until this correction the mapper threw on a `NULL`, which turned a legitimate
 * Ready-Made row into an internal server error for the **whole page** — every
 * custom row on it included.
 */
export interface AdminOrderQueueRow {
  readonly id: string;
  readonly code: string;
  readonly status: OrderState;
  /** `COL-TBL043-12` — immutable, and the only legitimate discriminator. */
  readonly origin: OrderOrigin;
  /** Present exactly when `origin` is `CUSTOM`. */
  readonly customRequestId: string | undefined;
  readonly customerId: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
  readonly createdAt: Date;
}

/**
 * The order root, plus the two frozen linkages an operator navigates by.
 *
 * `acceptedQuotationVersionId` is the frozen commercial basis (REL-073), never
 * `quotations.current_version_id`. `currentApprovalSnapshotId` is the order's
 * audited pointer (REL-074) — reported as stored, with each item carrying its
 * own immutable snapshot id beside it.
 *
 * `hold_reason`, `cancelled_reason`, `delivered_at` and `completed_at` are
 * deliberately absent: they are LC-14 evidence written by transitions APP7 does
 * not own, and publishing a shape for them now would fix a contract before the
 * checkpoint that fills it exists.
 *
 * Both linkages are optional for the reason `customRequestId` is: the same
 * CHECK constraint nulls all three together on a `READY_MADE` row, and
 * `origin` on the base row says which shape this is.
 */
export interface AdminOrderDetailRow extends AdminOrderQueueRow {
  /** Present exactly when `origin` is `CUSTOM`. */
  readonly acceptedQuotationVersionId: string | undefined;
  /** Present exactly when `origin` is `CUSTOM`. */
  readonly currentApprovalSnapshotId: string | undefined;
  readonly updatedAt: Date;
}

/**
 * One frozen commercial line (TBL-044, INV-12 — every column immutable).
 *
 * `skuId` and `customerOwnedProductId` are mutually exclusive
 * (`ck_order_items__exactly_one_subject`). Both are carried as stored; neither
 * is filled in from the other, and no Product, Variant, Side or Area identity is
 * fabricated for a customer-owned line.
 */
export interface AdminOrderItemRow {
  readonly position: number;
  readonly skuId: string | undefined;
  readonly customerOwnedProductId: string | undefined;
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
  readonly currencyCode: string;
  /**
   * The approval evidence that authorized this line, on a `CUSTOM` order.
   *
   * Absent on a Ready-Made line: `tg_order_items__origin_subject` reads
   * `orders.origin` and requires it on a `CUSTOM` line only, because nothing
   * was designed and nothing was approved — the customer bought a SKU that
   * already existed (`BR-031`).
   */
  readonly approvalSnapshotId: string | undefined;
}

export const ADMIN_ORDER_READ_REPOSITORY = Symbol('ADMIN_ORDER_READ_REPOSITORY');

export interface AdminOrderReadRepository {
  /** One keyset page, newest first, over-fetched by one. */
  listQueue(query: AdminOrderQueueQuery): Promise<AdminOrderQueueRow[]>;
  findDetail(orderId: string): Promise<AdminOrderDetailRow | undefined>;
  /**
   * The order's lines in `position` order. Empty only for an order with none.
   *
   * The origin is passed down rather than re-read: `findDetail` has already
   * resolved it from the same immutable column, and a second query would let
   * the two reads disagree about which shape the lines are being checked
   * against.
   */
  loadItems(orderId: string, origin: OrderOrigin): Promise<AdminOrderItemRow[]>;
}
