/**
 * When the `FULL` obligation is *payable* (`APP12-B04` §14, §25, §26,
 * `BR-027`, `BR-029`).
 *
 * ### Existing is not the same as payable — and here, not existing is the point
 *
 * The custom obligations exist from order creation and become payable later.
 * `FULL` is the opposite: `APP12-B03` creates it **at the moment it becomes
 * payable**, in the same transaction that sets the shipping fee and moves the
 * order `AWAITING_SHIPPING_FEE -> AWAITING_PAYMENT`. So a Ready-Made order
 * before its fee has **no** `FULL` obligation at all, and every payment
 * operation refuses it as an unreadable target rather than as a non-payable
 * one. That is `APP12-B04` §14 exactly: no provisional obligation is created to
 * have something to refuse, and the merchandise subtotal is never presented as
 * a payable amount.
 *
 * ### No payable column
 *
 * Nothing is stored and nothing is invented. Payability is read from the two
 * states that already exist — the order's state and the obligation's LC-15
 * state — so it cannot drift from them and no migration is involved.
 *
 * ```text
 * payable  ⇔  order.status = AWAITING_PAYMENT
 *             ∧ obligation.status = PENDING
 * ```
 *
 * ### Why each half is required
 *
 * The **order** half is the lifecycle authority. `AWAITING_SHIPPING_FEE` is
 * unreachable here (no obligation exists yet); `CANCELLED` — which is where a
 * lapsed reservation puts the order (`BR-026`) — must never hand a customer a
 * transfer memo, because the stock they were buying has been returned to
 * availability and paying for it now would create money the shop has to refund.
 * `READY_FOR_DELIVERY`, `DELIVERED` and `COMPLETED` are all after `APP12-B05`'s
 * verification, so payment is already collected there.
 *
 * The **obligation** half is what stops a second payment from a stale browser
 * tab, and it carries two distinct cases. `SATISFIED` is the window between an
 * Admin verifying the transfer and the same transaction moving the order.
 * `SUPERSEDED` is a shipping-fee correction: the predecessor is not payable at
 * any price, and the live obligation the customer must pay is its successor.
 * Neither is reachable through the delivered target resolver — `findLiveForOrder`
 * filters on the statuses `uq_payment_obligations__order_kind__live` arbitrates
 * — but the predicate states both so a caller reaching an obligation by another
 * route is refused rather than trusted.
 *
 * ### Reading is not acting
 *
 * This predicate gates the two operations that *act* — the QR, which is an
 * instruction to send money, and the attempt, which is a write. The read is
 * deliberately not gated by it: a customer whose payment has been verified is
 * entitled to see that committed truth, and the projection carries this same
 * boolean so they are told which of the two they are looking at.
 */
import type { OrderState, PaymentObligationState } from '@embroidery/database';

/** The one Ready-Made state in which the full payment may be collected. */
export const FULL_PAYMENT_PAYABLE_ORDER_STATE = 'AWAITING_PAYMENT' satisfies OrderState;

/** The one LC-15 state an unpaid obligation is in. */
export const FULL_PAYMENT_PAYABLE_OBLIGATION_STATE = 'PENDING' satisfies PaymentObligationState;

export function isFullPaymentPayable(input: {
  readonly orderStatus: OrderState;
  readonly obligationStatus: PaymentObligationState;
}): boolean {
  return (
    input.orderStatus === FULL_PAYMENT_PAYABLE_ORDER_STATE &&
    input.obligationStatus === FULL_PAYMENT_PAYABLE_OBLIGATION_STATE
  );
}
