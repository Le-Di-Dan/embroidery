/**
 * Exact equality between an observed transfer amount and the amount owed
 * (`APP7-B04` §12, §24).
 *
 * ### No floating point, anywhere on this path
 *
 * `payment_obligations.amount` is `numeric(14,2)` and reaches this process as a
 * **string**; the Admin's observed amount arrives as a string too. Neither is
 * ever converted to a JS `number`. `parseFloat('765000.10') !== 765000.1` in
 * enough cases to matter, and a deposit marked paid because two floats compared
 * equal is money the store never received.
 *
 * Both sides are scanned into `bigint` hundredths and compared as `bigint`. That
 * is exact at every magnitude `numeric(14,2)` can hold, and it makes `765000`,
 * `765000.0` and `765000.00` one value rather than three — the column stores the
 * two-decimal spelling, and an operator typing the whole đồng must not be told
 * their correct figure is wrong.
 *
 * ### It compares, and does nothing else
 *
 * There is no addition, no multiplication, no percentage and no rounding here.
 * `APP7-B04` §12 forbids recomputing the 40 % share, and a module that cannot
 * multiply cannot be edited into doing it. That is also why
 * `quotation/domain/pricing/vnd-amount.ts` is **not** imported: it is the
 * quotation module's pricing arithmetic — add, multiply, round-half-up — and
 * reaching across a module boundary for a full calculator in order to use one
 * equality would put every one of those operations one import away from a
 * payment-verification path that must never perform them.
 */

/** `numeric(14,2)` — twelve integer digits, two fractional, no exponent form. */
const DECIMAL_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

const HUNDREDTHS = 100n;

/**
 * Reads a non-negative decimal amount into `bigint` hundredths, or `undefined`.
 *
 * Deliberately strict: no sign, no exponent, no thousands separator, no
 * whitespace and no more than two fractional digits. A looser scan would accept
 * `1e6` and quietly agree with a caller who meant something else. `undefined`
 * rather than a throw, because both callers are judging input and want a
 * refusal.
 */
function toHundredths(text: string): bigint | undefined {
  if (!DECIMAL_PATTERN.test(text)) {
    return undefined;
  }
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * HUNDREDTHS + BigInt(fraction.padEnd(2, '0'));
}

/**
 * Whether the operator observed exactly the amount owed.
 *
 * `false` for an under-payment, an over-payment, and an unparseable observed
 * value alike. There is no tolerance, no epsilon and no "close enough" branch:
 * `APP7-B04` §12 makes exact match the predicate, and every other outcome is
 * routed to review rather than approximated into success.
 */
export function observedAmountMatches(observed: string, expected: string): boolean {
  const left = toHundredths(observed);
  const right = toHundredths(expected);
  return left !== undefined && right !== undefined && left === right;
}
