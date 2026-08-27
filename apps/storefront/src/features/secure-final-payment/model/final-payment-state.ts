/**
 * Which approved panel `/truy-cap/thanh-toan-con-lai` is showing, and the rules
 * that decide it (`APP9-S01` §7, §13, §14; `816:4`, `816:231`, `818:4`,
 * `818:37`, `818:87`, `818:137`, `820:4`).
 *
 * ## The load-bearing rule
 *
 * ```text
 * QR rendered  ≠  customer transferred  ≠  evidence uploaded
 *              ≠  evidence ACCEPTED     ≠  payment verified
 * ```
 *
 * So this module keeps three vocabularies apart and never derives one from
 * another:
 *
 * - **the order and the obligation** — `orderStatus`, `finalPaymentStatus` —
 *   are the only facts that can mean *paid*, and only an Admin verification
 *   produces them;
 * - **the attempt** this session opened is an intention to transfer and never a
 *   payment; `APP9-B02` creates it at `PENDING` and nothing a customer does
 *   moves it;
 * - **an image's `assetStatus`** does not appear in this file at all, because it
 *   can never select a payment panel.
 *
 * There is deliberately no `isPaid` boolean anywhere in this feature.
 *
 * ## `payable` is the server's answer and is not re-derived
 *
 * `APP9-S01` §7 is explicit: where the response supplies `payable`, the order
 * status may not stand in for it. `CustomerFinalPaymentResponse.payable` is
 * derived server-side on every read from *both* the order state and the
 * obligation state, and the QR and the initiation both refuse with
 * `409 FINAL_PAYMENT_NOT_PAYABLE` when it is false — so a screen that gated on
 * `orderStatus === AWAITING_FINAL_PAYMENT` instead would eventually offer a
 * control the server is already refusing.
 *
 * ## Why "attempt opened" and "waiting for the workshop" are one panel
 *
 * `820:44` records the collapse as a design decision, not an omission:
 * `publicOrderFinalPayment_current` answers `PENDING` for both and carries no
 * attempt detail at all, so splitting them would be invention. The instructions
 * panel *is* the waiting panel, and it says so in the customer's own words.
 *
 * ## Why `OTHER_STATE` exists
 *
 * `finalPaymentStatus` publishes `CANCELLED` and `SUPERSEDED`, which
 * `APP9-D01` drew no frame for. `APP7-D01` §751:174 already settled the rule for
 * a stored value the package does not draw — *show it neutrally rather than
 * guess at its meaning* — and this reuses that approved rule rather than
 * inventing a fifth state. Falling through to the not-payable card would tell a
 * customer whose balance was cancelled that we will bill them later; falling
 * through to the settled card would be worse.
 */
import {
  CustomerFinalPaymentResponseFinalPaymentStatus as PaymentStatus,
  CustomerFinalPaymentResponseOrderStatus as OrderStatus,
  type CustomerFinalPaymentResponse,
  type FinalPaymentAttemptResponse,
} from '@embroidery/api-client';

/** The five approved customer panels, and nothing else. */
export type FinalPaymentPanel =
  /** `818:4` — production is not finished, or the balance is not yet open. */
  | 'NOT_PAYABLE'
  /** `816:231` — the balance is payable and no attempt is open this session. */
  | 'PRE_ATTEMPT'
  /** `816:4` + `817:4` — instructions, QR, optional evidence, waiting. */
  | 'INSTRUCTIONS'
  /** `818:37` / `818:87` / `818:137` — the balance is settled; progress only. */
  | 'SETTLED'
  /** A stored obligation state the approved package does not draw. */
  | 'OTHER_STATE';

/**
 * The order states in which the balance has demonstrably been received.
 *
 * All three are reachable **only** through an Admin verifying that the money
 * arrived (`TR-LC14-06` and onward); nothing a customer does produces any of
 * them. Reading the order this way matters because `APP9-B04` can raise the
 * shipping fee after `READY_FOR_DELIVERY`, which re-opens an obligation while
 * the order stays advanced — and in that case the obligation is the authority,
 * which is why the disjunction below is ordered the way it is.
 */
const SETTLED_ORDER_STATES: ReadonlySet<CustomerFinalPaymentResponse['orderStatus']> = new Set([
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
]);

/**
 * Whether the balance has been verified, read from the two authoritative fields.
 *
 * `SATISFIED` means an Admin confirmed receipt; the three advanced order states
 * are LC-14's own projection of the same event. Either alone is sufficient and
 * both are the server's — opening an attempt, downloading the QR, transferring
 * at the bank and uploading five accepted images all leave both untouched.
 *
 * The disjunction is not defensive duplication: `APP9-B03` moves the obligation
 * and the order in one transaction, so a response carrying one without the other
 * is a response this screen should still read as settled rather than silently
 * demote to *waiting*.
 */
export function finalPaymentSettled(payment: CustomerFinalPaymentResponse): boolean {
  return (
    payment.finalPaymentStatus === PaymentStatus.SATISFIED ||
    SETTLED_ORDER_STATES.has(payment.orderStatus)
  );
}

/** The two stored obligation states `APP9-D01` deliberately drew no frame for. */
function undrawnObligation(payment: CustomerFinalPaymentResponse): boolean {
  return (
    payment.finalPaymentStatus === PaymentStatus.CANCELLED ||
    payment.finalPaymentStatus === PaymentStatus.SUPERSEDED
  );
}

/**
 * The panel, decided from server facts alone.
 *
 * Order matters. The settled reading wins over everything, because the
 * obligation and the order are the authority and an attempt this session happens
 * to be holding is not: a customer whose balance was verified while they were
 * looking at the instructions sees the progress card on the next read, not a
 * stale QR. `payable` then gates every panel that offers an action, so the
 * screen can never present a control the server is already refusing.
 */
export function finalPaymentPanelOf(
  payment: CustomerFinalPaymentResponse,
  attempt: FinalPaymentAttemptResponse | undefined,
): FinalPaymentPanel {
  if (finalPaymentSettled(payment)) return 'SETTLED';
  if (undrawnObligation(payment)) return 'OTHER_STATE';
  if (!payment.payable) return 'NOT_PAYABLE';
  return attempt === undefined ? 'PRE_ATTEMPT' : 'INSTRUCTIONS';
}

/**
 * Whether the screen may still offer to send another transfer image.
 *
 * Three independent gates, all of them facts rather than guesses:
 *
 * - the balance is not yet settled — after verification the list stays visible
 *   as history but nothing more is asked for;
 * - an attempt exists to attach the image to — evidence is addressed by
 *   `attemptId` and there is no such thing as evidence without one, which is
 *   precisely why `APP9-S01` §12 makes initiation the natural prerequisite
 *   rather than inventing an id;
 * - the quota is not reached.
 *
 * The count is the server's own list length, never a client tally: the backend
 * is the quota authority and a stale local count is refused rather than trusted.
 */
export function evidenceIntakeOpen(
  payment: CustomerFinalPaymentResponse,
  attempt: FinalPaymentAttemptResponse | undefined,
  submittedCount: number,
  maxPerAttempt: number,
): boolean {
  if (finalPaymentSettled(payment)) return false;
  if (attempt === undefined) return false;
  return submittedCount < maxPerAttempt;
}
