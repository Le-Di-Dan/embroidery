/**
 * Which `payment_reconciliations.action` each Admin decision writes
 * (`APP7-B04` §16, §18, §19).
 *
 * `PAYMENT_RECONCILIATION_ACTIONS` is a **closed CHECK set** —
 * `MANUAL_MATCH`, `RESOLVE_REVIEW`, `OBLIGATION_RECALC`,
 * `CARRYOVER_APPLICATION` (DB4 COL-TBL057-03, ADR-DB3-003 r7). B04 does not add
 * to it, and does not invent an action string for symmetry: the two APP7 actions
 * map onto the two that already describe what an operator is doing, and the
 * remaining two belong to obligation recalculation and carryover, neither of
 * which this checkpoint performs.
 *
 * ```text
 * attempt was REQUIRES_REVIEW  ->  RESOLVE_REVIEW    the operator is resolving one
 * anything else                ->  MANUAL_MATCH      the operator is matching a transfer
 * ```
 *
 * The rule keys on the status the attempt held **when the operation began**, not
 * on where it lands. `RESOLVE_REVIEW` describes the work — an open review was
 * taken up and answered — and that is true whether the answer was `SUCCEEDED` or
 * a second `REQUIRES_REVIEW` with a fuller reason. Where it landed is carried by
 * `resolved_status`, which TBL-057 leaves without a CHECK precisely so it can
 * record LC-16's set verbatim.
 *
 * ### An explicit review is a `MANUAL_MATCH` too, and that is not a fudge
 *
 * Routing a `PENDING` attempt into review is a manual reconciliation action
 * against a received (or missing) transfer — the same class of work as matching
 * one, ending in a different place. The alternative was `RESOLVE_REVIEW` for an
 * operation that resolves nothing, which would make the vocabulary lie about the
 * one thing it exists to record. `resolved_status = REQUIRES_REVIEW` states the
 * outcome exactly, so no reader has to infer it from the action.
 */
import { PAYMENT_RECONCILIATION_ACTIONS } from '@embroidery/database';
import type { PaymentAttemptState, PaymentReconciliationAction } from '@embroidery/database';

/** Re-exported so a caller states the vocabulary's origin rather than a literal. */
export { PAYMENT_RECONCILIATION_ACTIONS };

export function reconciliationActionFor(
  statusBefore: PaymentAttemptState,
): PaymentReconciliationAction {
  return statusBefore === 'REQUIRES_REVIEW' ? 'RESOLVE_REVIEW' : 'MANUAL_MATCH';
}
