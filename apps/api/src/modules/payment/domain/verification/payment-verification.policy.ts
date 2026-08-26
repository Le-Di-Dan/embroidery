/**
 * What an Admin verification is allowed to do to one attempt, and what the
 * result of comparing observed money against owed money is
 * (`APP7-B04` §12, §17, §18, §20, §21).
 *
 * Pure functions over plain values. No repository, no clock, no transaction and
 * no HTTP — so the whole decision matrix is testable without a database, and the
 * use case below it holds the transaction and nothing of the judgement.
 *
 * ### The three answers, and why there is no fourth
 *
 * ```text
 * SUCCEEDED        every expected fact matched exactly
 * REQUIRES_REVIEW  something contradicted — wrong amount, wrong reference
 * (refusal)        the attempt was never eligible to be verified at all
 * ```
 *
 * `APP7-B04` §17 is explicit that an under-payment, an over-payment or a
 * reference mismatch must **never** silently become `SUCCEEDED`, and §18 is
 * equally explicit that it must not be downgraded to a bare `400`/`409` when the
 * accepted lifecycle owns a durable review. LC-16 `TR-LC16-05` owns exactly
 * that: *any → `REQUIRES_REVIEW`, contradiction detected, mark R, admin alert*.
 * So a contradiction is a **committed** state change with mandatory
 * `review_reason`, not an error the operator has to remember.
 *
 * ### `REQUIRES_REVIEW → SUCCEEDED` is permitted, and was not invented here
 *
 * LC-16 `TR-LC16-06` reads *"REQUIRES_REVIEW → (resolved state), admin R,
 * reconciliation record"*, and the delivered
 * `DrizzlePaymentObligationRepository.settleAttempt` already admits
 * `REQUIRES_REVIEW` into the set of statuses it will settle from. Both
 * authorities agree, so the same verify operation resolves a review; nothing new
 * is added to the machine to make it possible.
 *
 * ### Terminal states never regress
 *
 * `SUCCEEDED`, `FAILED`, `EXPIRED`, `REFUNDED` and `PARTIALLY_REFUNDED` are
 * terminal in LC-16, and {@link classifyAttemptForVerification} answers
 * `settled` for every one of them. The exception is the exact replay of a
 * verification that already committed, which is a *read* of committed truth and
 * moves nothing — see {@link isSameVerificationApplication}.
 */
import type { PaymentAttemptState, PaymentObligationState } from '@embroidery/database';

import { observedAmountMatches } from './observed-amount';

/** LC-16 statuses a manual verification may settle **from**. */
const VERIFIABLE_FROM: readonly PaymentAttemptState[] = [
  'PENDING',
  'PROCESSING',
  'REQUIRES_REVIEW',
];

/** `APP7-G01` §1 — the only method this flow ever produces or verifies. */
export const BANK_TRANSFER_METHOD = 'BANK_TRANSFER';

/** The obligation kind `APP7` makes payable. `REMAINING` is APP9's. */
export const DEPOSIT_OBLIGATION_KIND = 'DEPOSIT';

/** How the attempt's current status bears on a verification command. */
export type AttemptVerifiability =
  /** `PENDING`, `PROCESSING` or `REQUIRES_REVIEW` — a decision may be applied. */
  | 'open'
  /** Already `SUCCEEDED`. Only an exact replay may read it; nothing may move it. */
  | 'succeeded'
  /** `FAILED`, `EXPIRED`, `REFUNDED`, `PARTIALLY_REFUNDED` — terminal, no retry here. */
  | 'settled';

export function classifyAttemptForVerification(status: PaymentAttemptState): AttemptVerifiability {
  if (VERIFIABLE_FROM.includes(status)) {
    return 'open';
  }
  return status === 'SUCCEEDED' ? 'succeeded' : 'settled';
}

/**
 * The facts the server derived, against which the operator's observation is
 * judged.
 *
 * Every one is server-owned: the amount and currency are the obligation's own
 * columns and the reference is derived from the order code by
 * `depositTransferReference`. Nothing here can be supplied by the request, which
 * is why the type has no field a caller's body maps onto.
 */
export interface ExpectedTransferFacts {
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
}

/** Exactly what the operator says they saw on the received transfer. */
export interface ObservedTransferFacts {
  readonly amount: string;
  readonly transferReference: string;
}

/** Why an observation did not match. Ordered, so one command yields one reason. */
export type VerificationMismatch = 'AMOUNT_MISMATCH' | 'REFERENCE_MISMATCH' | 'CURRENCY_MISMATCH';

export type VerificationVerdict =
  { readonly matched: true } | { readonly matched: false; readonly mismatch: VerificationMismatch };

/** `ck_payment_obligations__currency_vnd` — the only currency this flow settles. */
const VND = 'VND';

/**
 * Compares observed money against owed money, exactly.
 *
 * The currency check is against the obligation's **own** column rather than
 * against a value from the request. `APP7-B04` §11 gives the operator no
 * currency field, because there is nothing for them to choose: the column is
 * physically closed to `VND` by `ck_payment_obligations__currency_vnd`, so an
 * observed currency would be a field whose only legal value the server already
 * knows. The check remains because a row that somehow held anything else must
 * not be settled by a comparison that never looked.
 *
 * The reference is compared verbatim, with no normalisation, no case folding and
 * no punctuation stripping. `APP7-G01` §4 designed the 15-character uppercase
 * alphanumeric form precisely so it survives a bank's own normalisation; folding
 * here would silently accept a memo that is not the one the customer was given.
 */
export function judgeObservedTransfer(
  observed: ObservedTransferFacts,
  expected: ExpectedTransferFacts,
): VerificationVerdict {
  if (expected.currencyCode !== VND) {
    return { matched: false, mismatch: 'CURRENCY_MISMATCH' };
  }
  if (!observedAmountMatches(observed.amount, expected.amount)) {
    return { matched: false, mismatch: 'AMOUNT_MISMATCH' };
  }
  if (observed.transferReference !== expected.transferReference) {
    return { matched: false, mismatch: 'REFERENCE_MISMATCH' };
  }
  return { matched: true };
}

/**
 * Whether an already-`SUCCEEDED` attempt is the *same* verification the caller
 * is retrying (`APP7-B04` §22).
 *
 * A verification can commit while its HTTP response is lost. The retry must not
 * create a second application, and — the requirement that actually matters — it
 * must not tell the operator their payment failed merely because the first call
 * already worked. So a retry against an attempt that succeeded is answered with
 * the committed truth when, and only when, three things hold:
 *
 * ```text
 * the attempt is SUCCEEDED
 * the obligation is SATISFIED by *this exact* attempt
 * the observed facts still match the same expected facts
 * ```
 *
 * The second condition is what makes this convergence rather than credulity: an
 * attempt that succeeded but did not satisfy the obligation is a state no
 * committed verification can produce, and one whose deposit was satisfied by a
 * *different* attempt is CC-10's loser. Neither is a replay, and both are
 * refused.
 *
 * A retry carrying *different* observed facts is not the same logical
 * verification and is refused too — otherwise a second operator with a
 * contradictory reading would be shown a success as though it were their own.
 */
export function isSameVerificationApplication(input: {
  readonly attemptStatus: PaymentAttemptState;
  readonly obligationStatus: PaymentObligationState;
  readonly satisfiedByAttemptId: string | undefined;
  readonly attemptId: string;
  readonly observed: ObservedTransferFacts;
  readonly expected: ExpectedTransferFacts;
}): boolean {
  return (
    input.attemptStatus === 'SUCCEEDED' &&
    input.obligationStatus === 'SATISFIED' &&
    input.satisfiedByAttemptId === input.attemptId &&
    judgeObservedTransfer(input.observed, input.expected).matched
  );
}
