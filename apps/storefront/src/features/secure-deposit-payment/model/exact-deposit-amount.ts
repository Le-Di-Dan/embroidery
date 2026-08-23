/**
 * Displaying the deposit without ever computing it (`APP7-S01` §7, §11).
 *
 * The amount on this screen is the `DEPOSIT` obligation's **own frozen figure**.
 * `APP7-B03` reads it off the obligation row and recomputes no share of any
 * total; `APP6-G01` already fixed the split when the quotation was priced. So
 * there is no 40 % anywhere in this feature, no order total to take a share of,
 * and no arithmetic operator applied to money in any file under it.
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
 * ### Why this is a third copy of the rule in the repository
 *
 * `APP6-S01` states it in `secure-quotation/model/exact-money.ts` and `APP7-A01`
 * states it in `apps/admin/src/shared/presentation/exact-amount.ts`. Promoting
 * one of them would move a delivered module out from under its own boundary
 * guard — `test/boundary/secure-quotation-source.test.ts` proves *that feature*
 * contains no numeric coercion by scanning its directory, and a file that left
 * the directory would leave the guard. That is an APP6 change, and S01 is not
 * authorized to make it. The duplication is recorded as a nonblocking follow-up
 * instead; this feature's own boundary suite scans this file with the same rule.
 */

/** The Vietnamese thousands separator, as `APP7-D01` sets every amount. */
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

/**
 * The same amount with its currency mark.
 *
 * The code comes from the response — `APP7-B03` copies the obligation's own,
 * enforced to `VND` physically — rather than from a constant here, so the screen
 * states the currency the obligation was priced in instead of asserting one.
 */
export function formatExactMoney(amount: string, currencyCode: string): string {
  return `${formatExactAmount(amount)} ${currencyCode}`;
}
