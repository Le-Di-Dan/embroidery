/**
 * Which LC-14 move a verified payment performs, per obligation kind
 * (`APP9-B03` §7, `APP9-G01` §4).
 *
 * ```text
 * DEPOSIT     AWAITING_DEPOSIT        -> DEPOSIT_PAID          TR-LC14-02
 * REMAINING   AWAITING_FINAL_PAYMENT  -> READY_FOR_DELIVERY    TR-LC14-06
 * FULL        AWAITING_PAYMENT        -> READY_FOR_DELIVERY    APP12-B05
 * ```
 *
 * ### One table, not two code paths
 *
 * `APP7-B04` hard-coded its half in the use case: the kind check lived in the
 * resolver and the literal `'DEPOSIT_PAID'` lived at the `transition()` call.
 * `APP9-B03` needed a second pair, and two branches around a money transaction
 * is how the two drift. So both pairs are declared here, once, and the use case
 * reads the pair for the kind the persistence layer reported. Adding a third
 * kind is a row in this table plus the tests that justify it — never an `if`.
 *
 * ### The source state is a guard, not decoration
 *
 * Each row names the state the order **must already be in**. That is checked
 * before anything is written, for the reason `APP9-B01` recorded: LC-14
 * *legality* is not the guard. `ON_HOLD -> READY_FOR_DELIVERY` and
 * `PRODUCTION_COMPLETED -> AWAITING_FINAL_PAYMENT` are both legal moves, and
 * `ON_HOLD -> DEPOSIT_PAID` is legal too, so a verification that trusted
 * `isLegalOrderTransition` alone could carry a held order — or one whose Admin
 * has not yet opened final payment (`TR-LC14-05`) — straight past a step it
 * never took.
 *
 * `PRODUCTION_COMPLETED -> READY_FOR_DELIVERY` in particular is **not** legal
 * and would be refused by the repository anyway; the source guard is what turns
 * that into a deterministic refusal that writes nothing, instead of a
 * mid-transaction guard violation after the attempt was already settled.
 *
 * ### The third kind is a row, exactly as this file promised
 *
 * `APP12-DB01` added `FULL` to the database's kind set and `APP12-B03` gave
 * it a lifecycle; `APP12-B04` deliberately left it unverifiable, so no Admin
 * could settle a Ready-Made payment before the inventory half of that
 * settlement existed. `APP12-B05` is that half, and its whole contribution
 * here is one row plus one entry in the reference table — no branch, no second
 * verifier, no origin parameter.
 *
 * `FULL` shares `READY_FOR_DELIVERY` with `REMAINING`, and that is the
 * point: the two commerce shapes converge on one fulfilment lifecycle, so
 * `adminOrder_dispatch` and `adminOrder_complete` need no Ready-Made twin.
 * They do **not** share a source. `AWAITING_PAYMENT` is reachable only on the
 * Ready-Made side and `AWAITING_FINAL_PAYMENT` only on the custom one, so
 * neither kind's transition can be applied to the other's order: the source
 * guard refuses it before anything is written.
 *
 * `ck_payment_obligations__kind_by_origin` makes the kinds mutually exclusive
 * by origin, which is why the kind read off the locked obligation row is also
 * the origin discriminator, and why nothing here accepts an origin.
 *
 * ### Verifiability is a closed set
 *
 * `CST-039` has exactly three kinds and all three are here. A fourth added to
 * the database later resolves to `undefined` and is refused as not verifiable,
 * rather than silently inheriting another kind's transition.
 */
import type { OrderState } from '@embroidery/database';

/** The obligation kinds an Admin may verify. Nothing else is settleable here. */
export const VERIFIABLE_OBLIGATION_KINDS = ['DEPOSIT', 'REMAINING', 'FULL'] as const;

export type VerifiableObligationKind = (typeof VERIFIABLE_OBLIGATION_KINDS)[number];

export interface VerifiedPaymentTransition {
  /** The state the order must already be in for this verification to apply. */
  readonly source: OrderState;
  /** Where a successful verification moves it, inside the same transaction. */
  readonly target: OrderState;
}

const TRANSITION_BY_KIND: Readonly<Record<VerifiableObligationKind, VerifiedPaymentTransition>> = {
  DEPOSIT: { source: 'AWAITING_DEPOSIT', target: 'DEPOSIT_PAID' },
  REMAINING: { source: 'AWAITING_FINAL_PAYMENT', target: 'READY_FOR_DELIVERY' },
  FULL: { source: 'AWAITING_PAYMENT', target: 'READY_FOR_DELIVERY' },
};

export function isVerifiableObligationKind(kind: string): kind is VerifiableObligationKind {
  return (VERIFIABLE_OBLIGATION_KINDS as readonly string[]).includes(kind);
}

/**
 * The LC-14 pair for one obligation kind, or `undefined` for a kind this
 * surface has no authority over.
 */
export function verifiedPaymentTransitionFor(kind: string): VerifiedPaymentTransition | undefined {
  return isVerifiableObligationKind(kind) ? TRANSITION_BY_KIND[kind] : undefined;
}
