/**
 * Which of the eight approved variants `/truy-cap/don-hang` is showing, and the
 * rules that decide it (`APP12-S03` §12, §13, §22, §24, §29, §30; `911:305`).
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
 * - **the order and the obligation** are the only facts that can mean *paid*,
 *   and only an Admin verification produces them;
 * - **the attempt** this session opened is an intention to transfer;
 *   `APP12-B04` creates it at `PENDING` and nothing a customer does moves it;
 * - **an image's `assetStatus`** never selects a variant. It reaches this file
 *   as a bare count and nothing more, because a count is the most an image may
 *   contribute — *some evidence exists* is a reason to say the workshop is
 *   reconciling, and no image state may ever say the money arrived.
 *
 * There is deliberately no `isPaid` boolean anywhere in this feature.
 *
 * ## The order projection is the lifecycle authority (§11)
 *
 * `publicReadyMadeOrder_current` decides the variant. Not the payment attempt,
 * not the presence of a QR, not the evidence list, not a deadline, and not a
 * clock. That is why {@link orderVariantOf} takes the projection first and
 * everything else as a qualifier that can only ever move `AWAITING_PAYMENT` to
 * its *under review* presentation — never into or out of a terminal state.
 *
 * ## Expiry is read, never inferred (§29)
 *
 * ```text
 * status = CANCELLED  ·  terminationReason = RESERVATION_EXPIRED  →  EXPIRED
 * status = CANCELLED  ·  terminationReason absent                 →  CANCELLED
 * ```
 *
 * `APP12-B04-C1` publishes `terminationReason` as a machine-readable enum
 * derived from the reservation's own committed status, written by the expiry
 * sweep in the same transaction as the cancellation. The field is **spread**,
 * so an ordinary cancellation carries no key at all. Nothing in this feature
 * parses `cancelled_reason`, compares a deadline against `Date.now()`, or reads
 * a missing payment object as expiry — all three are forbidden by §29 and all
 * three would be a second lifecycle owned by the browser (§13).
 */
import {
  ReadyMadeOrderAccessResponseStatus as OrderStatus,
  ReadyMadeOrderAccessResponseTerminationReason as TerminationReason,
  ReadyMadeOrderPaymentResponseStatus as ObligationStatus,
  type CustomerFullPaymentResponse,
  type FullPaymentAttemptResponse,
  type ReadyMadeOrderAccessResponse,
} from '@embroidery/api-client';

/**
 * The eight approved customer variants, plus the neutral fallback.
 *
 * The eight are `911:305`'s own state board, in its own order. `OTHER_STATE` is
 * not a ninth design: the contract publishes `ON_HOLD` and `CANCELLING`, the
 * approved package draws neither, and `APP7-D01` `751:174` already settled the
 * rule for a stored value with no frame — *show it neutrally rather than guess
 * at its meaning*. `APP9-S01` reused that rule under this exact name and this
 * reuses it again rather than inventing a variant or, worse, falling through:
 * routing `ON_HOLD` to the payment frame would offer a control the server
 * refuses, and routing it to a terminal frame would claim an ending that has
 * not happened.
 */
export type OrderVariant =
  /** `911:308` — no fee yet, so no total, no QR and nothing to pay. */
  | 'AWAITING_SHIPPING_FEE'
  /** `911:315` — the fee is set; this is the one payable state. */
  | 'AWAITING_PAYMENT'
  /** `911:323` — payable, and this session has real attempt or evidence truth. */
  | 'PAYMENT_UNDER_REVIEW'
  /** `911:330` — an Admin verified receipt; the workshop is preparing the goods. */
  | 'READY_FOR_DELIVERY'
  /** `911:338` — handed over. */
  | 'DELIVERED'
  /** `911:345` — the terminal success state. */
  | 'COMPLETED'
  /** `911:352` — an ordinary cancellation. */
  | 'CANCELLED'
  /** `911:359` — the stock reservation lapsed before payment. */
  | 'EXPIRED'
  /** A stored order state the approved package drew no frame for. */
  | 'OTHER_STATE';

/**
 * The three order states that mean an Admin has verified the money arrived.
 *
 * All three are reachable only through `APP12-B05`'s verification and the
 * fulfilment transitions after it; nothing a customer does produces any of
 * them.
 */
const FULFILMENT_VARIANTS: Readonly<Record<string, OrderVariant>> = {
  [OrderStatus.READY_FOR_DELIVERY]: 'READY_FOR_DELIVERY',
  [OrderStatus.DELIVERED]: 'DELIVERED',
  [OrderStatus.COMPLETED]: 'COMPLETED',
};

/**
 * What this mounted session knows beyond the order projection.
 *
 * Deliberately not the attempt object and not the evidence rows: the only thing
 * either may contribute to a *variant* is whether the customer has done
 * something the workshop now has to reconcile. Passing booleans rather than the
 * records makes it a compile-time impossibility for an image's `assetStatus` or
 * an attempt's `status` to reach the decision below.
 */
export interface SessionPaymentFacts {
  /** An attempt opened this session and still current for the live obligation. */
  readonly attemptOpened: boolean;
  /** At least one transfer image has been recorded against that attempt. */
  readonly evidenceSubmitted: boolean;
}

/**
 * The variant, decided from the order projection first.
 *
 * Order matters. Every terminal and fulfilment reading is taken *before* the
 * session facts are consulted, so an attempt this session happens to be holding
 * can never keep a cancelled order on a payment screen or demote a verified one
 * back to *waiting*. The session facts reach exactly one branch —
 * `AWAITING_PAYMENT` — and there they choose only between two presentations of
 * the same payable state.
 */
export function orderVariantOf(
  order: ReadyMadeOrderAccessResponse,
  session: SessionPaymentFacts,
): OrderVariant {
  if (order.status === OrderStatus.CANCELLED) {
    // The one machine-readable discriminator, read and never inferred.
    return order.terminationReason === TerminationReason.RESERVATION_EXPIRED
      ? 'EXPIRED'
      : 'CANCELLED';
  }

  const fulfilment = FULFILMENT_VARIANTS[order.status];
  if (fulfilment !== undefined) return fulfilment;

  if (order.status === OrderStatus.AWAITING_SHIPPING_FEE) return 'AWAITING_SHIPPING_FEE';

  if (order.status === OrderStatus.AWAITING_PAYMENT) {
    // §12C and §13: this is a *presentation* of `AWAITING_PAYMENT`, never a
    // ninth order state and never a client-owned lifecycle. The order is still
    // `AWAITING_PAYMENT` on the wire and the instructions stay on screen
    // (`911:328`); what changes is the pill and the sentence that explains why
    // the customer is waiting.
    return session.attemptOpened || session.evidenceSubmitted
      ? 'PAYMENT_UNDER_REVIEW'
      : 'AWAITING_PAYMENT';
  }

  return 'OTHER_STATE';
}

/** The pill's tone, following the `APP9 FinalPaymentPill` vocabulary exactly. */
export type VariantTone = 'WAITING' | 'PROGRESS' | 'SUCCESS' | 'DANGER' | 'NEUTRAL';

const TONES: Readonly<Record<OrderVariant, VariantTone>> = {
  AWAITING_SHIPPING_FEE: 'WAITING',
  AWAITING_PAYMENT: 'WAITING',
  PAYMENT_UNDER_REVIEW: 'PROGRESS',
  READY_FOR_DELIVERY: 'SUCCESS',
  DELIVERED: 'SUCCESS',
  COMPLETED: 'SUCCESS',
  CANCELLED: 'DANGER',
  EXPIRED: 'DANGER',
  OTHER_STATE: 'NEUTRAL',
};

export function variantToneOf(variant: OrderVariant): VariantTone {
  return TONES[variant];
}

/**
 * The two variants in which the payment block is on screen at all.
 *
 * Everything else — the QR, the transfer details, the initiation control, the
 * evidence intake — hangs below this one answer, which is why §30's terminal
 * shutdown is a property of the tree rather than of six separate guards.
 * `PAYMENT_UNDER_REVIEW` is included because `911:328` requires the
 * instructions to stay visible while the workshop reconciles.
 */
export function showsPaymentBlock(variant: OrderVariant): boolean {
  return variant === 'AWAITING_PAYMENT' || variant === 'PAYMENT_UNDER_REVIEW';
}

/**
 * Whether the FULL obligation may be read at all (§14).
 *
 * Exactly one order state, and it is the state in which `APP12-B04` publishes
 * the obligation. Before an operator sets the fee the contract deliberately
 * carries no payment object, so asking for one would spend a secure-link
 * request to receive a 404 the projection already told us to expect — and §14
 * forbids using a predictable 404 as a page-control mechanism.
 */
export function readsFullPayment(order: ReadyMadeOrderAccessResponse): boolean {
  return order.status === OrderStatus.AWAITING_PAYMENT;
}

/**
 * Whether the QR and a new attempt may be requested right now.
 *
 * `payable` is the server's own derivation from both the order state and the
 * obligation state, recomputed on every read and stored nowhere; the QR and the
 * initiation both refuse with `409` when it is false. §21 requires the QR to
 * exist only while payable, and reading the flag rather than re-deriving it
 * from `orderStatus` is what guarantees the browser never asks for something
 * the server is already refusing.
 */
export function isPayable(full: CustomerFullPaymentResponse | undefined): boolean {
  return full?.payable === true;
}

/**
 * Whether an attempt this session opened is still the *current* obligation's.
 *
 * `APP12-B03` can supersede a FULL obligation while the customer is on the page
 * — an operator corrects the shipping fee, the obligation is recomposed from
 * the frozen subtotal, and a new one becomes current. §24 is explicit about
 * what must happen next: the amount and the QR follow the successor, and the
 * predecessor's attempt is treated as historical rather than migrated onto it.
 *
 * The **amount** is the discriminator, and deliberately so. The transfer
 * reference is not: the contract states it names the *order* rather than the
 * obligation and is byte-identical across a correction, precisely so a transfer
 * sent before one still reconciles. Comparing references would therefore call a
 * stale attempt current. Comparing the exact decimal strings — never parsed,
 * never coerced — is the one comparison that actually distinguishes them.
 */
export function attemptMatchesObligation(
  attempt: FullPaymentAttemptResponse,
  full: CustomerFullPaymentResponse,
): boolean {
  return attempt.amount === full.fullPaymentAmount;
}

/**
 * Whether the screen may still offer to send another transfer image.
 *
 * Three independent gates, all of them facts rather than guesses:
 *
 * - the payment block is on screen — after verification the list stays visible
 *   as history but nothing further is asked for, and §30 forbids an upload that
 *   reads as a new payment action on a terminal order;
 * - a current attempt exists to attach the image to — evidence is addressed by
 *   `attemptId` and there is no such thing as evidence without one, which is
 *   why §23 makes initiation the natural prerequisite rather than inventing an
 *   id;
 * - the quota is not reached.
 *
 * The count is the server's own list length, never a client tally: the backend
 * is the quota authority and a stale local count is refused rather than
 * trusted.
 */
export function evidenceIntakeOpen(
  variant: OrderVariant,
  attemptId: string | undefined,
  submittedCount: number,
  maxPerAttempt: number,
): boolean {
  if (!showsPaymentBlock(variant)) return false;
  if (attemptId === undefined) return false;
  return submittedCount < maxPerAttempt;
}

/**
 * What the amount card's highlight says (`APP12-U01-C1` F2).
 *
 * ```text
 * PAYABLE      the live obligation, while the payment block is on screen
 * SETTLED      the satisfied obligation's own frozen figure, as history
 * PENDING_FEE  AWAITING_SHIPPING_FEE only — no total exists yet
 * NONE         anything else: nothing is owed and nothing was settled
 * ```
 *
 * U01 caught the pending-fee sentence on `READY_FOR_DELIVERY` and `DELIVERED`,
 * after the customer had paid, because the card fell back to it whenever the
 * payment block was off screen. The sentence now belongs to the one state it
 * is true in.
 *
 * `SETTLED` is read from the projection's `payment.status`, which `APP12-B04`
 * publishes for the live obligation — and `SATISFIED` is live. The figure is
 * that obligation's own `payableTotal`, never a sum of the subtotal and fee.
 */
export type AmountHighlight = 'PAYABLE' | 'SETTLED' | 'PENDING_FEE' | 'NONE';

export function amountHighlightOf(
  order: ReadyMadeOrderAccessResponse,
  showsTotal: boolean,
  full: CustomerFullPaymentResponse | undefined,
): AmountHighlight {
  if (showsTotal && full !== undefined) return 'PAYABLE';
  if (order.payment?.status === ObligationStatus.SATISFIED) return 'SETTLED';
  if (order.status === OrderStatus.AWAITING_SHIPPING_FEE) return 'PENDING_FEE';
  return 'NONE';
}
