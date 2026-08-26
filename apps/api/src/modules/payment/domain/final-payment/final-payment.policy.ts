/**
 * When the `REMAINING` obligation is *payable* (`APP9-B02` §6, `APP9-G01` §4).
 *
 * ### Existing is not the same as payable
 *
 * `APP7-W01` creates the `REMAINING` obligation in the order-conversion
 * transaction (INV-04 / TR-LC15-01), so it exists from the moment the order
 * does — months before anyone may pay it. `APP9-B01` is what opens it, by
 * moving the order `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT`
 * (`TR-LC14-05`).
 *
 * ### No payable column
 *
 * Nothing is stored and nothing is invented. Payability is read from the two
 * states that already exist — the order's LC-14 state and the obligation's
 * LC-15 state — so it cannot drift from them and no migration is involved.
 *
 * ```text
 * payable  ⇔  order.status = AWAITING_FINAL_PAYMENT
 *             ∧ obligation.status = PENDING
 * ```
 *
 * ### Why each half is required
 *
 * The **order** half is the lifecycle authority: `PRODUCTION_COMPLETED` means
 * the work is done but the Admin has not opened collection, and `ON_HOLD` — a
 * legal move out of `AWAITING_FINAL_PAYMENT` and back into it (`ADR-DB3-003`
 * r5) — means the order is paused, so neither may hand a customer a transfer
 * memo. `READY_FOR_DELIVERY`, `DELIVERED` and `COMPLETED` are all *after*
 * `TR-LC14-06`, so payment is already collected there.
 *
 * The **obligation** half is what stops a second payment on a settled
 * obligation from a stale browser tab: `AWAITING_FINAL_PAYMENT` ∧ `SATISFIED` is
 * the exact window between an Admin verifying the transfer and the same
 * transaction moving the order, and a QR served in it would invite a duplicate
 * transfer nobody owes.
 *
 * ### Reading is not acting
 *
 * This predicate gates the two operations that *act* — the QR, which is an
 * instruction to send money, and the attempt, which is a write. The read is
 * deliberately not gated by it: a customer whose order has moved on is entitled
 * to see that their final payment is settled, and the projection carries this
 * same boolean so they are told which of the two they are looking at.
 */
import type { OrderState, PaymentObligationState } from '@embroidery/database';

/** The one LC-14 state in which the remaining payment may be collected. */
export const FINAL_PAYMENT_PAYABLE_ORDER_STATE = 'AWAITING_FINAL_PAYMENT' satisfies OrderState;

/** The one LC-15 state an unpaid obligation is in. */
export const FINAL_PAYMENT_PAYABLE_OBLIGATION_STATE = 'PENDING' satisfies PaymentObligationState;

export function isFinalPaymentPayable(input: {
  readonly orderStatus: OrderState;
  readonly obligationStatus: PaymentObligationState;
}): boolean {
  return (
    input.orderStatus === FINAL_PAYMENT_PAYABLE_ORDER_STATE &&
    input.obligationStatus === FINAL_PAYMENT_PAYABLE_OBLIGATION_STATE
  );
}
