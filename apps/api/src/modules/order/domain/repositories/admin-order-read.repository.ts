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
import type { OrderState } from '@embroidery/database';

/** The keyset position of the last row of the previous page. */
export interface AdminOrderQueuePosition {
  readonly createdAt: Date;
  readonly id: string;
}

export interface AdminOrderQueueFilter {
  /** Absent means "every state", not a default subset — B02 invents no triage set. */
  readonly statuses: readonly OrderState[] | undefined;
}

export interface AdminOrderQueueQuery {
  readonly filter: AdminOrderQueueFilter;
  readonly after: AdminOrderQueuePosition | undefined;
  /** Already clamped by `resolveLimit`; the adapter over-fetches by one. */
  readonly limit: number;
}

/** The smallest order-owned set that identifies and triages one order. */
export interface AdminOrderQueueRow {
  readonly id: string;
  readonly code: string;
  readonly status: OrderState;
  readonly customRequestId: string;
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
 */
export interface AdminOrderDetailRow extends AdminOrderQueueRow {
  readonly acceptedQuotationVersionId: string;
  readonly currentApprovalSnapshotId: string;
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
  readonly approvalSnapshotId: string;
}

export const ADMIN_ORDER_READ_REPOSITORY = Symbol('ADMIN_ORDER_READ_REPOSITORY');

export interface AdminOrderReadRepository {
  /** One keyset page, newest first, over-fetched by one. */
  listQueue(query: AdminOrderQueueQuery): Promise<AdminOrderQueueRow[]>;
  findDetail(orderId: string): Promise<AdminOrderDetailRow | undefined>;
  /** The order's lines in `position` order. Empty only for an order with none. */
  loadItems(orderId: string): Promise<AdminOrderItemRow[]>;
}
