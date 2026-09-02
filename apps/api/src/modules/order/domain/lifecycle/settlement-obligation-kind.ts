/**
 * Which obligation `GRD-016` names, per order origin (`APP12-B05` §22, §31).
 *
 * ```text
 * CUSTOM       REMAINING   the balance collected after production (TR-LC14-06)
 * READY_MADE   FULL        the single payment collected before anything ships
 * ```
 *
 * ### The guard did not change; the column it reads did
 *
 * `GRD-016` has always been "the payment this order still owes is settled".
 * `APP9-B05` could spell that `REMAINING` because every order was custom. With
 * two origins the constant became a lie for one of them: a Ready-Made order has
 * no `REMAINING` obligation and never will —
 * `ck_payment_obligations__kind_by_origin` forbids it — so the delivered
 * dispatch would have refused every Ready-Made order with
 * `ORDER_REMAINING_PAYMENT_MISSING`, for a payment that was fully collected.
 *
 * A table rather than an `if`, for the same reason the verification kinds are
 * one: the guard stays a lookup on a closed set, so a third origin added later
 * fails to compile here instead of silently inheriting the custom answer.
 *
 * ### It names the obligation, not the amount
 *
 * Nothing here knows what is owed. The kind selects which row `GRD-016` reads;
 * whether that row is `SATISFIED` is the obligation's own committed state, and
 * no caller recomputes it from `orders.total_amount` — which `APP12-B05` §22
 * forbids precisely because a total is not a payment.
 */
import type { OrderOrigin, PaymentObligationKind } from '@embroidery/database';

const KIND_BY_ORIGIN: Readonly<Record<OrderOrigin, PaymentObligationKind>> = {
  CUSTOM: 'REMAINING',
  READY_MADE: 'FULL',
};

/** The obligation whose settlement `GRD-016` requires before dispatch. */
export function settlementObligationKindFor(origin: OrderOrigin): PaymentObligationKind {
  return KIND_BY_ORIGIN[origin];
}
