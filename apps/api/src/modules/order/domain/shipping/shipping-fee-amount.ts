/**
 * Exact VND arithmetic for one shipping-fee change (`APP9-B04` §7, §8).
 *
 * ### No floating point, anywhere on this path
 *
 * `shipping_details.fee_amount` and `payment_obligations.amount` are both
 * `numeric(14,2)` and reach this process as **strings**. Neither ever becomes a
 * JS `number`. `parseFloat('50000.10') + parseFloat('0.2')` is the whole
 * argument: a remaining balance that lost a đồng is a figure the customer never
 * agreed to, and one that gained a đồng is money the store cannot collect.
 *
 * Amounts are carried as `bigint` **hundredths** of a VND — exact at every
 * magnitude `numeric(14,2)` can hold — and the only way back out is
 * {@link formatFeeAmount}, which produces the two-decimal form the column
 * stores. `50000`, `50000.0` and `50000.00` are therefore one value rather than
 * three, so an operator typing whole đồng is not told their correct figure
 * differs from the stored one.
 *
 * ### Why this is not `quotation/domain/pricing/vnd-amount.ts`
 *
 * The same reason `payment/domain/verification/observed-amount.ts` gives for not
 * importing it: that module is the quotation module's **pricing calculator** —
 * multiply, percentage, round-half-up — and reaching across a module boundary
 * for a full calculator in order to use one subtraction would put every one of
 * those operations one import away from a path that must never perform them.
 *
 * This module can add and subtract, and that is all it can do. It cannot
 * multiply, cannot take a percentage and cannot round, so no future edit here
 * can quietly re-derive a deposit share or a total. `APP9-B04` §9 forbids
 * recomputing `total - deposit`, and a module with no multiplication cannot be
 * edited into doing it.
 */

/** Hundredths of one VND. The only in-memory representation of an amount. */
export type FeeAmount = bigint & { readonly __brand: 'FeeAmount' };

const HUNDREDTHS = 100n;

/** `numeric(14,2)` — twelve integer digits, two fractional, no exponent form. */
const DECIMAL_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

/**
 * Reads a non-negative decimal amount into hundredths, or `undefined`.
 *
 * Deliberately strict: no sign, no exponent, no thousands separator, no
 * whitespace, at most two fractional digits. A looser scan would accept `1e6`
 * and quietly agree with a caller who meant something else. `undefined` rather
 * than a throw, because every caller is judging a stored or submitted value and
 * wants a refusal it can report.
 */
export function parseFeeAmount(text: string): FeeAmount | undefined {
  if (!DECIMAL_PATTERN.test(text)) {
    return undefined;
  }
  const [whole = '0', fraction = ''] = text.split('.');
  return (BigInt(whole) * HUNDREDTHS + BigInt(fraction.padEnd(2, '0'))) as FeeAmount;
}

/** The two-decimal form `numeric(14,2)` stores. The only way out of `bigint`. */
export function formatFeeAmount(amount: FeeAmount): string {
  const whole = amount / HUNDREDTHS;
  const fraction = amount % HUNDREDTHS;
  return `${String(whole)}.${String(fraction).padStart(2, '0')}`;
}

/**
 * The signed movement from one fee to another, in hundredths.
 *
 * Positive is an increase (which needs the customer's acknowledgement), negative
 * a decrease, zero no change at all.
 */
export function feeDelta(previous: FeeAmount, next: FeeAmount): bigint {
  return next - previous;
}

/**
 * The successor obligation's amount: the live one, moved by the fee delta.
 *
 * This is `DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §1.2's "recalculated **theo
 * chênh lệch**" — by the difference — applied to the figure that is actually
 * live, never to a re-derived `total - deposit`. Applying the delta to the live
 * amount is what keeps the invariant true across *repeated* edits:
 *
 * ```text
 * remaining = quoted_remaining + (current_fee - quoted_fee)
 * ```
 *
 * Recomputing from the quotation each time would instead re-apply the whole
 * movement from the quoted fee and double-count every edit after the first.
 *
 * `undefined` when the result would not be a positive amount that
 * `numeric(14,2)` can hold: `ck_payment_obligations__amount_positive` requires
 * `> 0`, so a decrease large enough to wipe out the balance is a refusal for the
 * caller to report rather than a constraint violation to leak.
 */
export function successorAmount(live: FeeAmount, delta: bigint): FeeAmount | undefined {
  const next = live + delta;
  if (next <= 0n || next > 10n ** 14n - 1n) {
    return undefined;
  }
  return next as FeeAmount;
}

/** Whether the amount is a whole đồng — the database's VND scale rule. */
export function isWholeDong(amount: FeeAmount): boolean {
  return amount % HUNDREDTHS === 0n;
}
