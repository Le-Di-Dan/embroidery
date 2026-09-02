/**
 * What a customer may be told about their Ready-Made order (`APP12-B04` §12,
 * §13, §27).
 *
 * ## Every absence is deliberate
 *
 * No internal order UUID, customer id, SKU id, stock id, reservation id,
 * obligation id, attempt id, grant id or audit id. `BR-032` keeps raw internal
 * identifiers off the customer surface, and this surface takes none of them as
 * input either — the order comes from the grant — so publishing one would only
 * teach a caller a locator no operation accepts.
 *
 * No Admin notes, no moderation record, no reconciliation, no verification
 * evidence, no refund and no provider field: those are `APP12-B05`'s and
 * `IMP-O007`'s. No carrier, tracking code or fulfilment note — `APP12-D01` §I
 * records that the Ready-Made order page shows no shipping tracking. No
 * cancellation reason: the stored one is an operator-facing sentence, and
 * republishing it would put internal wording on a customer's screen.
 *
 * ## One lifecycle, not two (§13, §27)
 *
 * `status` is the order's own state, published verbatim, exactly as
 * `ReadyMadeOrderCreatedResponse` and the two custom payment projections
 * publish theirs. No parallel customer vocabulary is invented here: a second
 * lifecycle is a second thing to keep in step, and `APP12-D01` §I already maps
 * these states to the eight page variants in the design rather than expecting
 * the API to pre-digest them.
 *
 * The states this can carry are the six `READY_MADE_ORDER_STATES` plus the
 * shared exception states, and every one of them is reachable and renderable:
 * `AWAITING_SHIPPING_FEE` before an operator prices delivery,
 * `AWAITING_PAYMENT` after, `READY_FOR_DELIVERY` once `APP12-B05` verifies the
 * transfer, then `DELIVERED` and `COMPLETED`, and `CANCELLED` — which is where
 * a lapsed stock reservation puts the order (`BR-026`).
 *
 * `APP12-B04-C1` adds {@link ReadyMadeOrderView.terminationReason} beside it
 * rather than a second terminal status, so `APP12-D01` §I's `EXPIRED` and
 * `CANCELLED` presentations are distinguishable without a second lifecycle to
 * keep in step. See `order-termination-reason.ts`.
 */
import type { OrderState, PaymentObligationState } from '@embroidery/database';

import type { OrderTerminationReason } from '../../domain/ready-made/order-termination-reason';
import type {
  ReadyMadeOrderDeliveryView,
  ReadyMadeOrderLineView,
} from '../../domain/repositories/ready-made-order-access.repository';

/**
 * The order's money, once there is any to state.
 *
 * The whole object is absent until an operator sets the shipping fee, because
 * until then there is genuinely no obligation and no payable total (`BR-027`,
 * `BR-029`). That absence is the contract: a `payableTotal` of `'0.00'` or a
 * total silently equal to the merchandise subtotal would both be figures the
 * customer never agreed to.
 */
export interface ReadyMadeOrderPaymentView {
  readonly status: PaymentObligationState;
  /**
   * The exact amount owed — the live obligation's own frozen figure.
   *
   * Composed once by `APP12-B03` as `frozen merchandise subtotal + exact
   * shipping fee`, and read back here rather than recomposed. After a fee
   * correction this is the successor obligation's amount; the superseded
   * predecessor is never visible on this surface.
   */
  readonly payableTotal: string;
  readonly payable: boolean;
}

export interface ReadyMadeOrderView {
  readonly orderCode: string;
  readonly status: OrderState;
  /**
   * Why a terminal order ended, when that is a committed machine-readable
   * fact (`APP12-B04-C1`).
   *
   * Present only for a `CANCELLED` order whose stock hold ended by expiry.
   * Absent means "not classified as an expiry" — never "not cancelled",
   * which is what `status` says. Derived from `inventory_reservations.status`
   * and never from `orders.cancelled_reason`.
   */
  readonly terminationReason: OrderTerminationReason | undefined;
  readonly currencyCode: string;
  readonly placedAt: Date;
  readonly item: ReadyMadeOrderLineView;
  /** Frozen at creation, excluding delivery. Never the payable total. */
  readonly merchandiseSubtotal: string;
  readonly delivery: ReadyMadeOrderDeliveryView | undefined;
  readonly payment: ReadyMadeOrderPaymentView | undefined;
  /**
   * When the held stock is released if the order has not been paid for.
   *
   * The order's own `RESERVED` reservation `expires_at`, read rather than
   * recomputed (§36). Absent once nothing `RESERVED` stands, which is exactly
   * when a countdown must stop being shown — the window has lapsed, the stock
   * has been released, or the reservation was consumed at dispatch.
   */
  readonly paymentDeadline: Date | undefined;
  readonly accessExpiresAt: Date;
}
