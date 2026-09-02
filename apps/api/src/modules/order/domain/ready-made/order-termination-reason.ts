/**
 * Why a terminal Ready-Made order ended, as a machine-readable fact
 * (`APP12-B04-C1`).
 *
 * ## The gap this closes
 *
 * `APP12-D01` §I requires the customer's order page to render `CANCELLED` and
 * `EXPIRED` as **distinct** states. The order's own lifecycle has one terminal
 * state — `CANCELLED` — and `APP12-B04-C1` §7 keeps it that way: adding an
 * `EXPIRED` value to `orders.status` would be a second backend lifecycle for a
 * presentation distinction.
 *
 * So the distinction is published beside the status rather than inside it:
 *
 * ```text
 * status = CANCELLED
 * terminationReason = RESERVATION_EXPIRED   -> the D01 EXPIRED presentation
 * terminationReason = absent                -> the D01 CANCELLED presentation
 * ```
 *
 * `APP12-S03` selects a page variant from a value it is handed. It parses
 * nothing, infers nothing from a missing deadline or a missing payment object,
 * and implements no backend rule — which is what `APP12-B04-C1` §2 requires of
 * a Storefront checkpoint.
 *
 * ## Where the value comes from, and where it never comes from
 *
 * From `inventory_reservations.status`. The Ready-Made expiry sweep moves the
 * reservation `RESERVED -> EXPIRED` and the order to `CANCELLED` **in one
 * transaction**, so a fully-expired stock hold under a cancelled order is a
 * committed domain fact rather than an inference.
 *
 * It is **never** derived from `orders.cancelled_reason`. That column holds
 * operator- and system-authored prose — it exists so a human reading the audit
 * trail knows what happened — and a customer-facing classification that matched
 * on its wording would change meaning the day someone rephrased a sentence, or
 * the day an operator legitimately typed the word "expired" while cancelling an
 * order for an unrelated reason. `APP12-B04-C1` §5 forbids it and the suite
 * proves both halves: misleading prose cannot create the classification, and
 * absent prose cannot prevent it.
 *
 * ## Why this is not a cancellation taxonomy
 *
 * One value, because exactly one machine-readable cause exists today. There is
 * no runtime path that cancels a Ready-Made order for any other recorded
 * reason, so a second member would be a name with nothing behind it —
 * `APP12-B04-C1` §6 forbids inventing one. A future structured cancellation
 * command adds its value here, with the persisted fact that justifies it.
 */
import type { OrderState } from '@embroidery/database';

/**
 * The one machine-readable termination cause (`BR-026`).
 *
 * The customer's stock reservation lapsed before the order was paid for, so the
 * sweep released the stock and closed the order.
 */
export const RESERVATION_EXPIRED = 'RESERVATION_EXPIRED' as const;

/** The published vocabulary. One member today; see the header. */
export const ORDER_TERMINATION_REASONS = [RESERVATION_EXPIRED] as const;

export type OrderTerminationReason = (typeof ORDER_TERMINATION_REASONS)[number];

/** The one terminal state a Ready-Made order can be classified in. */
const CANCELLED = 'CANCELLED' satisfies OrderState;

/**
 * Classifies a terminal Ready-Made order, or declines to.
 *
 * Both inputs are committed facts: the order's own status, and Inventory's
 * answer to whether this order's stock hold ended by expiry. Neither is prose
 * and neither is a timestamp comparison taken at read time.
 *
 * `undefined` for every case that is not unambiguously an expiry — a live
 * order, a cancellation whose stock ended some other way, and a cancellation
 * with no reservation at all. An absent reason means "not classified as an
 * expiry", never "not cancelled": the order's own `status` says that, and a
 * caller must read both.
 */
export function terminationReasonOf(input: {
  readonly orderStatus: OrderState;
  readonly stockEndedByExpiry: boolean;
}): OrderTerminationReason | undefined {
  if (input.orderStatus !== CANCELLED || !input.stockEndedByExpiry) {
    return undefined;
  }
  return RESERVATION_EXPIRED;
}
