/**
 * `READY_MADE_PAYMENT_WINDOW` — the 24 hours a customer has to pay, once there
 * is finally something to pay (`BR-025`, `APP12-B03` §16).
 *
 * ### Why this is a second constant, not a reuse of the initial one
 *
 * `READY_MADE_INITIAL_RESERVATION_WINDOW_MS` said so itself: *"Those are
 * separate constants for separate events; this one is only the initial
 * window."* They are numerically equal today and that is a coincidence of
 * policy, not a shared rule. The initial window bounds how long an order may
 * sit **unpriced** before the stock goes back on sale; this one bounds how long
 * a **priced** order may sit unpaid. A future decision to give operators
 * longer to quote a fee than customers get to pay it would change one and not
 * the other, and a single shared constant would silently change both.
 *
 * ### The window resets exactly once
 *
 * ```text
 * order created            expires_at = created_at + 24h   (APP12-B02)
 * first fee confirmed      expires_at = now()      + 24h   (this constant)
 * fee corrected            expires_at UNCHANGED
 * same fee replayed        expires_at UNCHANGED
 * ```
 *
 * The reset belongs to the **first** confirmation because that is the moment
 * the customer first has a payable figure: measuring their payment window from
 * an instant before the price existed would charge them for the operator's
 * response time. A correction is not that moment. It is the operator amending
 * their own figure, and letting it restart the clock would make the deadline
 * indefinitely extendable by an operator — which is both an abuse surface and a
 * way to hold stock off sale forever without any customer ever paying.
 *
 * The instant itself is never in this module. It is `now()` as the database
 * computes it inside the confirming transaction
 * (`SkuStockRepository.rescheduleReservationExpiry`), so what is written here
 * is only the length.
 */

/** 24 hours, in milliseconds. */
export const READY_MADE_PAYMENT_WINDOW_MS = 86_400_000;

/**
 * `payment_reconciliations.reason` for a Ready-Made fee-driven recomposition.
 *
 * The vocabulary is otherwise entirely reused: the `action` is APP9's own
 * `OBLIGATION_RECALC` (COL-TBL057-03), because a fee change that supersedes a
 * live obligation is exactly what that action already names. Only the sentence
 * differs, and it says which figures moved.
 */
export function readyMadeFeeRecalcReason(previousFee: string, newFee: string): string {
  return `Ready-Made shipping fee changed from ${previousFee} to ${newFee} before payment.`;
}
