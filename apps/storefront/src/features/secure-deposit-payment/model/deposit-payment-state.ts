/**
 * Which approved panel `/truy-cap/thanh-toan` is showing, and the one rule that
 * decides it (`APP7-S01` §19, §23, §28; `751:3`, `751:175`).
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
 * - **the order and the obligation** — `orderStatus`, `depositStatus` — are the
 *   only facts that can mean *paid*, and only an Admin verification produces
 *   them;
 * - **the attempt** — `PENDING`, `REQUIRES_REVIEW`, `FAILED`, `EXPIRED` — is
 *   what the customer's own initiation opened, and none of its values is ever
 *   read as payment;
 * - **an image's `assetStatus`** does not appear in this file at all, because it
 *   can never select a payment panel.
 *
 * There is deliberately no `isPaid` boolean anywhere in this feature. The
 * confirmation is selected by {@link depositConfirmed}, which reads two server
 * fields and computes nothing.
 *
 * ## Why `SUCCEEDED` does not select the confirmation
 *
 * `751:175` marks *attempt `SUCCEEDED` **and** obligation `SATISFIED`* as the
 * paid row — the conjunction is the claim, not the attempt alone. An attempt can
 * only reach `SUCCEEDED` through an Admin verification that satisfies the
 * obligation in the same transaction, so the obligation is the fact worth
 * reading and the attempt is the one that may be stale in this session's hand.
 * `SUCCEEDED` therefore asks the controller for one re-read of the deposit
 * (`shouldReconcileDeposit`) and, until that read says `SATISFIED`, renders the
 * neutral undrawn panel rather than a success this screen cannot prove.
 *
 * ## Why the undrawn panel exists
 *
 * `751:174` states the rule for the values `APP7` never produces — `PROCESSING`,
 * `REFUNDED`, `PARTIALLY_REFUNDED`, and the obligation's `CANCELLED` and
 * `SUPERSEDED`: *show the code neutrally rather than guess at its meaning*. A
 * `default:` that fell through to the instructions would invent a meaning; a
 * `default:` that fell through to the terminal card would invent a worse one.
 */
import {
  CustomerDepositResponseDepositStatus,
  CustomerDepositResponseOrderStatus,
  DepositAttemptResponseStatus,
  type CustomerDepositResponse,
  type DepositAttemptResponse,
} from '@embroidery/api-client';

/** The six approved customer panels, and nothing else. */
export type DepositPanel =
  /** `747:3` — the order exists, no attempt has been opened in this session. */
  | 'PRE_ATTEMPT'
  /** `745:3` / `750:3` — instructions, QR, evidence intake, waiting. */
  | 'INSTRUCTIONS'
  /** `749:3` — the attempt is being reconciled by the workshop. */
  | 'REVIEW'
  /** `749:26` — the attempt is over; only a new one moves forward. */
  | 'TERMINAL'
  /** `751:174` — a stored value APP7 does not produce, shown neutrally. */
  | 'UNDRAWN'
  /** `749:50` / `750:415` — the deposit is verified. */
  | 'CONFIRMED';

/**
 * Whether the deposit is verified, read from the two authoritative fields.
 *
 * `SATISFIED` means an Admin confirmed receipt; `DEPOSIT_PAID` is the order's
 * own LC-14 projection of the same event. Either alone is sufficient and both
 * are the server's — opening an attempt, downloading the QR, transferring at the
 * bank and uploading five accepted images all leave both untouched.
 *
 * The disjunction is not defensive duplication: `APP7-B04` moves the obligation
 * and the order in one transaction, so a response carrying one without the other
 * is a response this screen should still read as verified rather than silently
 * demote to *waiting*.
 */
export function depositConfirmed(deposit: CustomerDepositResponse): boolean {
  return (
    deposit.depositStatus === CustomerDepositResponseDepositStatus.SATISFIED ||
    deposit.orderStatus === CustomerDepositResponseOrderStatus.DEPOSIT_PAID
  );
}

/**
 * Whether an attempt is over for good.
 *
 * Both values are terminal for *that attempt* and neither is a failed payment:
 * `749:26` says so in the customer's words, and §22 forbids resetting the same
 * attempt. The remedy is a new initiation, never a mutation of this one.
 */
export function attemptIsTerminal(attempt: DepositAttemptResponse): boolean {
  return (
    attempt.status === DepositAttemptResponseStatus.FAILED ||
    attempt.status === DepositAttemptResponseStatus.EXPIRED
  );
}

/**
 * Whether this attempt state obliges exactly one re-read of the deposit.
 *
 * Only `SUCCEEDED`, and only once. It is the single state in which the attempt
 * claims something the deposit read has not yet confirmed, so the honest move is
 * to ask the authority rather than to promote the claim. Every other value is
 * already consistent with the deposit facts in hand, and re-reading on them
 * would be the beginning of the polling §20 forbids.
 */
export function shouldReconcileDeposit(attempt: DepositAttemptResponse): boolean {
  return attempt.status === DepositAttemptResponseStatus.SUCCEEDED;
}

/**
 * The panel, decided from server facts alone.
 *
 * Order matters: the confirmation wins over every attempt state, because the
 * obligation is the authority and an attempt this session happens to be holding
 * is not. A customer whose deposit was verified while they were looking at the
 * instructions sees the confirmation on the next read, not a stale QR.
 */
export function depositPanelOf(
  deposit: CustomerDepositResponse,
  attempt: DepositAttemptResponse | undefined,
): DepositPanel {
  if (depositConfirmed(deposit)) return 'CONFIRMED';
  if (attempt === undefined) return 'PRE_ATTEMPT';
  switch (attempt.status) {
    case DepositAttemptResponseStatus.PENDING:
      return 'INSTRUCTIONS';
    case DepositAttemptResponseStatus.REQUIRES_REVIEW:
      return 'REVIEW';
    case DepositAttemptResponseStatus.FAILED:
    case DepositAttemptResponseStatus.EXPIRED:
      return 'TERMINAL';
    default:
      return 'UNDRAWN';
  }
}

/**
 * Whether the screen may still offer to send another transfer image.
 *
 * Four independent gates, all of them facts rather than guesses:
 *
 * - the deposit is not yet verified — `749:91` keeps the list visible after
 *   confirmation but stops offering to add to it;
 * - an attempt exists to attach the image to — evidence is addressed by
 *   `attemptId` and there is no such thing as evidence without one;
 * - that attempt is not terminal — `APP7-B05` answers `EVIDENCE_ATTEMPT_CLOSED`
 *   for one that is, and offering the control would be offering a refusal;
 * - the quota is not reached — `748:144`.
 *
 * `REQUIRES_REVIEW` is deliberately **not** a gate: `749:23` keeps the intake
 * open there, because a reconciliation is exactly when another image helps.
 *
 * The count is the server's own list length, never a client tally: §18 makes the
 * backend the quota authority, and a stale local count is refused rather than
 * trusted.
 */
export function evidenceIntakeOpen(
  deposit: CustomerDepositResponse,
  attempt: DepositAttemptResponse | undefined,
  submittedCount: number,
  maxPerAttempt: number,
): boolean {
  if (depositConfirmed(deposit)) return false;
  if (attempt === undefined) return false;
  if (attemptIsTerminal(attempt)) return false;
  return submittedCount < maxPerAttempt;
}
