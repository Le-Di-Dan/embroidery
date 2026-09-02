/**
 * The `READY_MADE` half of AGG-15 Order persistence (`APP12-B02`, `BR-031`).
 *
 * A **separate contract from {@link OrderRepository}**, deliberately.
 * `OrderRepository` is the custom-order aggregate: every one of its reads
 * returns an {@link Order}, and `Order` carries `customRequestId`,
 * `acceptedQuotationVersionId` and `currentApprovalSnapshotId` as required
 * fields because a `CUSTOM` order genuinely has all three
 * (`ck_orders__custom_chain_by_origin`). `order-row.mapper.ts` refuses a
 * Ready-Made row for that reason rather than widening those fields to optional,
 * and `APP12-DB01` recorded the decision: widening them would make every
 * existing custom consumer start handling an absence that cannot occur on its
 * own branch, and would silence the compiler exactly where a routing bug should
 * be loud.
 *
 * So the two origins get two contracts over one table. What they share is the
 * table's own physical truth — the origin/status CHECK, the chain CHECK, the
 * `order_items` trigger — which is where sharing belongs.
 *
 * ## What creation is, in full
 *
 * One transaction, everything or nothing (`BR-024`):
 *
 * ```text
 * orders            origin READY_MADE, status AWAITING_SHIPPING_FEE,
 *                   custom chain NULL, total = merchandise subtotal
 * order_items       exactly one SKU line, frozen (INV-12, BR-021)
 * outbox            order.created  (SE-006, same row shape as the custom path)
 * ```
 *
 * The shipping detail and the inventory reservation are written by their own
 * delivered writers inside the **caller's** transaction — `saveShippingDetails`
 * on `OrderRepository` and `createReservation` on `SkuStockRepository` — because
 * each of those tables already has exactly one writer and a second one here
 * would be a second copy of its rules.
 *
 * ## What creation is not
 *
 * No payment obligation (`BR-029` — `APP12-B03` creates the `FULL` obligation
 * once the Admin has set the fee), no `ORDER_ACCESS` grant (`APP12-B04`), no
 * production job (`BR-030`), no shipping fee and no payable total (`BR-027`).
 * `orders.total_amount` is the **merchandise subtotal** and is the only money
 * this path writes; it is not yet, and must not be presented as, an amount
 * anyone owes.
 */
import type { OrderState } from '@embroidery/database';

import type { OrderId, TransitionOrderInput } from './order.repository';

/**
 * The frozen Ready-Made line (`BR-021`).
 *
 * Every display fact is a **snapshot taken at creation**, not a pointer to be
 * joined later: a customer reading their order history a year afterwards must
 * see the product they bought, under the name it had, at the price they paid,
 * however often the Catalog has been edited since.
 *
 * `variantLabel` and `sizeLabel` are optional because `product_variants` really
 * does carry two independent nullable attributes and a SKU may legitimately have
 * neither. An absent attribute is snapshotted as absent — never as `'N/A'`, an
 * empty string or a fabricated default, which would be inventing a fact about
 * the order rather than recording one.
 */
export interface ReadyMadeOrderLine {
  readonly skuId: string;
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
  readonly currencyCode: string;
}

export interface CreateReadyMadeOrderInput {
  readonly id: OrderId;
  readonly code: string;
  /**
   * The customer this order belongs to.
   *
   * Resolved from a verified contact by APP4's own path before this is called
   * (`ADR-DB2-001` r5). It is never a client-supplied value — `APP12-B02` §7 —
   * and this writer has no way to tell the difference, which is precisely why
   * the resolution is not permitted to happen anywhere but there.
   */
  readonly customerId: string;
  /** Exactly one line. Ready-Made checkout sells one SKU (`APP12-P01`). */
  readonly line: ReadyMadeOrderLine;
}

/**
 * A committed Ready-Made order, as its own writer reports it.
 *
 * No custom-chain fields, because there are none to report: they are physically
 * `NULL` on every row of this origin.
 */
export interface ReadyMadeOrder {
  readonly id: OrderId;
  readonly code: string;
  readonly customerId: string;
  readonly status: OrderState;
  readonly totalAmount: string;
  readonly currencyCode: string;
  /** The authoritative creation instant — `now()` as the database recorded it. */
  readonly createdAt: Date;
}

export const READY_MADE_ORDER_REPOSITORY = Symbol('READY_MADE_ORDER_REPOSITORY');

export interface ReadyMadeOrderRepository {
  /**
   * Creates the order and its single frozen line, and appends `order.created`.
   *
   * The merchandise subtotal is the caller's computed line total — this writer
   * performs no money arithmetic, so there is no second place a subtotal could
   * be derived differently from `BR-021`.
   *
   * @requiresTransaction — the reservation, the shipping detail and the
   * idempotency record commit with it or none of them do (`BR-023`, `BR-024`).
   */
  createReadyMade(input: CreateReadyMadeOrderInput): Promise<ReadyMadeOrder>;

  /** The order behind an id, if it is a Ready-Made one. Reads only. */
  findReadyMadeById(id: OrderId): Promise<ReadyMadeOrder | undefined>;

  /**
   * The Ready-Made order under its row lock, before a decision is made about it.
   *
   * The `READY_MADE` counterpart of `OrderRepository.loadForUpdate`, and needed
   * for the same reason: the reservation-expiry sweep must decide *from* the
   * order's committed status — only `AWAITING_SHIPPING_FEE` and
   * `AWAITING_PAYMENT` are expirable (`BR-026`) — and reading that status
   * unlocked would leave exactly the window the order row exists to close.
   *
   * Returns `undefined` for an order that does not exist **and** for one whose
   * origin is `CUSTOM`: the caller of this method is only ever authorised over
   * the Ready-Made branch, and a custom order it cannot act on and an order that
   * is not there are the same non-answer to it.
   *
   * It is the **first** lock in the expiry flow, which keeps the delivered
   * `orders` → `inventory_reservations` → `sku_stocks` direction
   * (`DB8_LOCK_ORDER_MATRIX.md`) intact.
   *
   * @requiresTransaction
   */
  loadReadyMadeForUpdate(id: OrderId): Promise<ReadyMadeOrder | undefined>;

  /**
   * Moves a Ready-Made order, with the same legality, reason and evidence rules
   * every order move has.
   *
   * The write itself is `applyOrderTransition`, shared with the custom
   * aggregate; this method only maps its result. There is one transition
   * implementation, not one per origin — `ck_orders__origin_status_allowed` is
   * what keeps the two lifecycles apart, in the database.
   *
   * @requiresTransaction
   */
  transitionReadyMade(input: TransitionOrderInput): Promise<ReadyMadeOrder>;
}
