/**
 * The Storefront's one way to print a stored amount (`APP12-H01`, closing
 * `FU-APP12-S01-02` and `FU-APP12-S03-05`).
 *
 * Five features had written this module for themselves — `secure-quotation`
 * (`APP6-S01`), `secure-deposit-payment` (`APP7-S01`), `secure-final-payment`
 * (`APP9-S01`), `ready-made-purchase` (`APP12-S01`) and
 * `secure-ready-made-order` (`APP12-S03`). Each stated the rule correctly and
 * each deferred promotion for the same honest reason: every feature's boundary
 * suite proves *its own directory* contains no numeric coercion by scanning it,
 * so a file that left the directory would leave its guard. The guard moved with
 * the code — `test/boundary/shared-money-source.test.ts` scans this module with
 * the same rule, and each feature's own scan still runs over what remains — so
 * the reason to keep five copies is gone.
 *
 * The copies had already drifted, which is the argument for this file rather
 * than against it: four rendered a negative amount with the typographic minus
 * the approved figures use, and `ready-made-purchase` rendered an ASCII hyphen.
 * No screen has shown a negative amount, so nothing was visibly wrong and
 * nothing would have caught it. The typographic form is the delivered majority
 * and is what this module does.
 *
 * ## The rule
 *
 * An amount arrives as a decimal **string**, because a VND figure through an
 * IEEE-754 double is precision loss no later formatting can undo. This module
 * therefore does string work and nothing else: no `Number(...)`, no
 * `parseFloat`, no `parseInt`, no unary `+`, no `Math.round`, no `toFixed`. The
 * grouping walks the integer digits from the right and inserts separators; it
 * cannot change the value it was handed, and an input it does not recognise
 * comes back untouched rather than guessed at.
 *
 * ### Why the decimals are dropped, and why that is not rounding
 *
 * VND has no minor unit, and an amount is refused before it is ever stored
 * unless it is a whole đồng, so a persisted amount's fraction is always `.00`.
 * The formatter shows the integer part alone. When the fraction is *not* all
 * zeros the amount is something this system never wrote, and the string comes
 * back verbatim instead of truncated — hiding a non-zero fraction would be the
 * one way this file could misreport a figure.
 *
 * ## What this module is not
 *
 * It is presentation, not arithmetic. It has no `+`, no `-`, no `×` over money,
 * and it is not the place to acquire one: every total this Storefront shows is
 * a figure the server composed and froze, never a sum the browser re-derived.
 */

/** The Vietnamese thousands separator, as every approved amount is set. */
const GROUP_SEPARATOR = '.';
const GROUP_SIZE = 3;

/** The typographic minus, matching the approved figures. */
const MINUS_SIGN = '−';

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/** A percentage, which is the one non-money figure that shares the rule. */
const PERCENT_PATTERN = /^(-?\d+)(?:\.(\d+))?$/;

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
 * An input this cannot parse comes back unchanged, so an unexpected server
 * value is shown as it is rather than replaced by a wrong one.
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
 * One amount with its currency, as the approved frames print it
 * (`1.285.000 VND`).
 *
 * The currency comes from the response beside the amount it belongs to and is
 * never assumed to be `VND` here, even where an obligation enforces it.
 */
export function formatExactMoney(amount: string, currencyCode: string): string {
  return `${formatExactAmount(amount)} ${currencyCode}`;
}

/**
 * Whether a stored amount is zero, whatever its sign or decimal column.
 *
 * `APP6-S01` uses it to decide whether an optional quotation line — a manual
 * adjustment, a shipping fee — is a line at all. Answered by inspecting the
 * digits rather than by comparing to `0`, because comparing means coercing.
 * An unparseable input answers `false`: a value this cannot read is not
 * something to claim is zero.
 */
export function isZeroAmount(amount: string): boolean {
  const match = AMOUNT_PATTERN.exec(amount.trim());
  if (match === null) {
    return false;
  }
  const [, , integer = '', fraction = ''] = match;
  return !/[^0]/.test(integer) && !/[^0]/.test(fraction);
}

/**
 * One stored percentage, with its sign, trimmed of a trailing zero fraction.
 *
 * `APP6-S01`'s deposit rate is the single consumer. `40.00` reads `40%` and
 * `37.50` reads `37.5%`: a fraction that is all zeros is noise from the decimal
 * column, while a real one is a figure the workshop set deliberately and is
 * kept.
 */
export function formatExactPercent(percent: string): string {
  const match = PERCENT_PATTERN.exec(percent);
  if (match === null) {
    return percent;
  }
  const [, integer = '', fraction] = match;
  if (fraction === undefined || !/[^0]/.test(fraction)) {
    return `${integer}%`;
  }
  return `${integer}.${fraction.replace(/0+$/, '')}%`;
}
