/**
 * Displaying the remaining balance without ever computing it (`APP9-S01` §6,
 * §8).
 *
 * The amount on this screen is the `REMAINING` obligation's **own frozen
 * figure**. `APP9-B02` reads it off the obligation row — copied from the
 * accepted quotation when `APP7-W01` created the order — and recomputes nothing:
 * no total is read, no deposit is subtracted, no quotation is opened. So there
 * is no order total anywhere in this feature to take a difference from, and no
 * arithmetic operator is applied to money in any file under it.
 *
 * That absence is load-bearing rather than incidental. A `B04` shipping-fee
 * increase changes what the customer owes without changing the deposit, so
 * `total − deposit` is a subtraction that silently disagrees with the
 * obligation the moment a fee moves — which is exactly why `APP9-D01` marks the
 * derivation forbidden on the Admin frame too.
 *
 * The value arrives as a decimal **string** because a VND amount through an
 * IEEE-754 double is precision loss no later formatting can undo. This module
 * therefore does string work and nothing else: no `Number(...)`, no
 * `parseFloat`, no `parseInt`, no unary `+`, no `Math.round`. The grouping below
 * walks the integer digits from the right and inserts separators; it cannot
 * change the value it was handed, and an input it does not recognise comes back
 * untouched rather than guessed at.
 *
 * ### Why the decimals are dropped, and why that is not rounding
 *
 * VND has no minor unit and `APP6-B01` refuses any amount that is not a whole
 * đồng before it is ever stored, so a persisted amount's fraction is always
 * `.00`. The formatter shows the integer part alone. When the fraction is *not*
 * all zeros the amount is something this system never wrote, and the string is
 * returned verbatim instead of truncated — hiding a non-zero fraction would be
 * the one way this file could misreport a figure.
 *
 * ### Why this is a fourth statement of the rule in the repository
 *
 * `APP6-S01`, `APP7-S01` and `APP7-A01` each state it in their own boundary.
 * Promoting one would move a delivered module out from under its own guard —
 * `test/boundary/secure-deposit-source.test.ts` proves *that feature* contains
 * no numeric coercion by scanning its directory, and a file that left the
 * directory would leave the guard. That is an APP6/APP7 change and S01 is not
 * authorized to make it, so this feature's own boundary suite scans this file
 * with the same rule and the duplication is recorded as a follow-up.
 */

/** The Vietnamese thousands separator, as `APP9-D01` sets every amount. */
const GROUP_SEPARATOR = '.';
const GROUP_SIZE = 3;
/** The typographic minus, matching the approved figures. */
const MINUS_SIGN = '−';

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

function groupDigits(digits: string): string {
  let grouped = '';
  for (let index = digits.length; index > 0; index -= GROUP_SIZE) {
    const start = index - GROUP_SIZE > 0 ? index - GROUP_SIZE : 0;
    const chunk = digits.slice(start, index);
    grouped = grouped === '' ? chunk : `${chunk}${GROUP_SEPARATOR}${grouped}`;
  }
  return grouped;
}

/**
 * One stored amount, grouped for reading.
 *
 * An input this cannot parse comes back unchanged, so an unexpected server value
 * is shown as it is rather than replaced by a wrong one.
 */
export function formatExactAmount(amount: string): string {
  const match = AMOUNT_PATTERN.exec(amount);
  if (match === null) {
    return amount;
  }
  const [, sign = '', integer = '', fraction] = match;
  if (fraction !== undefined && /[^0]/.test(fraction)) {
    return amount;
  }
  return `${sign === '-' ? MINUS_SIGN : ''}${groupDigits(integer)}`;
}
