/**
 * Reading a `200` from `adminPaymentAttempt_verify` (`740:3`, `740:56`).
 *
 * ## `200` does not mean "verified"
 *
 * `APP7-B04` answers `200` for **both** halves of the verification: on an exact
 * match the attempt becomes `SUCCEEDED`, the deposit `SATISFIED` and the order
 * `DEPOSIT_PAID`; on a mismatch nothing is satisfied, the order does not move,
 * and the attempt is routed to `REQUIRES_REVIEW` — with the same status line.
 * `attemptStatus` is what says which happened, so this module branches on the
 * canonical response and never on the transport.
 *
 * The consequence for the screen is the point of `740:105`: a mismatch is a
 * **durable business outcome** that has already been written to the
 * reconciliation history, not a form error. It is never shown as "Xác nhận thất
 * bại", and the dialog does not reopen blank as though nothing had happened.
 *
 * ## Exact success is both facts, not one
 *
 * `751:3` forbids collapsing the groups, and this is where that would be easiest
 * to get wrong. A success state is claimed only when the attempt is `SUCCEEDED`
 * **and** the obligation is `SATISFIED`. An attempt that succeeded against an
 * obligation that did not is reported as "the server recorded something, here is
 * the current truth", because a screen that announced a settled payment from one
 * of the two facts would be asserting something the response did not say.
 *
 * ## Why the order's destination state is no longer the third condition
 *
 * `APP7-B04` also required `orderStatus === 'DEPOSIT_PAID'`, which was exact
 * while a deposit was the only thing this screen could verify. It is not a
 * portable rule: a verified `REMAINING` lands the order on `READY_FOR_DELIVERY`
 * (`APP9-B03`) and so does a verified Ready-Made `FULL` (`APP12-B05`), so the
 * literal made every non-deposit success fall through to `recorded` and
 * announce nothing.
 *
 * The fix is **not** a kind → destination table here. That is LC-14, it is the
 * server's, and a copy of it in the browser would be a second lifecycle
 * authority that drifts the moment a transition changes — precisely what these
 * modules exist to prevent. The two facts this module *can* judge without
 * owning a lifecycle are the attempt's own state and the obligation's own
 * state, and both are still required. `orderStatus` is carried through and
 * rendered as the server reported it, never asserted against a literal.
 *
 * ## Nothing here is projected into the cache
 *
 * The decision response is a **receipt**. The caller re-reads
 * `adminOrderPayment_read` and renders the persisted result; what this module
 * produces decides only which approved outcome panel is shown beside it.
 */
import type { PaymentDecisionResponse } from '@embroidery/api-client';

const ATTEMPT_SUCCEEDED = 'SUCCEEDED';
const ATTEMPT_REQUIRES_REVIEW = 'REQUIRES_REVIEW';
const OBLIGATION_SATISFIED = 'SATISFIED';

/**
 * What the screen shows after a settled decision.
 *
 * - `verified` — the exact-match path, and the only value that may render
 *   "Đã xác nhận tiền cọc".
 * - `requiresReview` — the mismatch path and the explicit-review path alike;
 *   both leave the attempt in `REQUIRES_REVIEW` with the deposit and the order
 *   unchanged, and both are reported as an outcome rather than a failure.
 * - `recorded` — anything else the contract can produce. The server wrote
 *   something this build has no approved panel for, so the panel says exactly
 *   that and points at the refetched truth instead of guessing.
 */
export type PaymentDecisionKind = 'verified' | 'requiresReview' | 'recorded';

export interface PaymentDecisionOutcome {
  readonly kind: PaymentDecisionKind;
  readonly attemptStatus: string;
  readonly depositStatus: string;
  readonly orderStatus: string;
  /**
   * True when this response reported a decision that had already committed —
   * the retry of a call whose response was lost. Nothing was written twice.
   */
  readonly replayed: boolean;
}

export function readPaymentDecision(decision: PaymentDecisionResponse): PaymentDecisionOutcome {
  const base = {
    attemptStatus: decision.attemptStatus,
    depositStatus: decision.depositStatus,
    orderStatus: decision.orderStatus,
    replayed: decision.replayed,
  };

  // All three, or none. See the class comment: one fact is not the payment.
  // Both facts, or neither. `depositStatus` keeps its `APP7-B04` field name on
  // the decision receipt and describes whichever obligation the decision acted
  // on — the deposit, the balance, or the Ready-Made full payment.
  if (
    decision.attemptStatus === ATTEMPT_SUCCEEDED &&
    decision.depositStatus === OBLIGATION_SATISFIED
  ) {
    return { kind: 'verified', ...base };
  }

  if (decision.attemptStatus === ATTEMPT_REQUIRES_REVIEW) {
    return { kind: 'requiresReview', ...base };
  }

  return { kind: 'recorded', ...base };
}

/**
 * The same three-fact test applied to the **refetched** payment truth, for the
 * ambiguity recovery (`741:78`).
 *
 * After a lost response the screen has no decision receipt to read, so it asks
 * the current state the same question the receipt would have answered. The
 * attempt is located by id rather than assumed to be the newest one: a
 * concurrent initiation could have added another since the dialog opened.
 */
export function isPaymentSettledFor(
  payments: {
    readonly currentObligation?: { readonly status: string } | undefined;
    readonly attempts: readonly { readonly attemptId: string; readonly status: string }[];
  },
  attemptId: string,
): boolean {
  const attempt = payments.attempts.find((candidate) => candidate.attemptId === attemptId);
  return (
    attempt?.status === ATTEMPT_SUCCEEDED &&
    payments.currentObligation?.status === OBLIGATION_SATISFIED
  );
}

/** Whether the refetched truth shows the attempt now awaiting reconciliation. */
export function isAttemptAwaitingReview(
  payments: {
    readonly attempts: readonly { readonly attemptId: string; readonly status: string }[];
  },
  attemptId: string,
): boolean {
  return (
    payments.attempts.find((candidate) => candidate.attemptId === attemptId)?.status ===
    ATTEMPT_REQUIRES_REVIEW
  );
}
