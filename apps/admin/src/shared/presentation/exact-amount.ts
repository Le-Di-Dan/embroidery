/**
 * Displaying an exact stored amount without ever computing one.
 *
 * `APP7-B02` and `APP7-B04` transport every figure — the order total, an order
 * line's unit price and line total, the deposit obligation's expected amount, an
 * attempt's amount and a reconciliation's observed amount — as a decimal
 * **string**, because a VND amount through an IEEE-754 double is precision loss
 * no later formatting can undo.
 *
 * So this module does string work and nothing else. There is no `Number(...)`,
 * no `parseFloat`, no `parseInt`, no unary `+`, no `Math.round` and no
 * arithmetic operator applied to an amount anywhere in it. The grouping walks
 * the integer digits from the right and inserts separators; it cannot change the
 * value it was handed, and a string it does not recognise is returned untouched
 * rather than guessed at.
 *
 * ### The currency is data, never a constant
 *
 * `732:3` renders the amount and the `currencyCode` as two separate columns, and
 * `734:3` joins them with a space. Neither is a `₫` this module chose: the code
 * is whatever `currencyCode` says, so an order stored in something other than
 * VND could never be mislabelled by the screen that shows it.
 *
 * ### Why the decimals are dropped, and why that is not rounding
 *
 * VND has no minor unit and the APP6/APP7 money rules refuse any amount that is
 * not a whole đồng before it is stored, so a persisted amount's decimals are
 * always `.00`. The formatter shows the integer part alone. When the fraction is
 * **not** all zeros the amount is something this system never wrote, and the
 * string is returned verbatim instead of being truncated: hiding a non-zero
 * fraction would be the one way this file could misreport a figure.
 *
 * Admin shared scope, because the order queue and the order detail both need it.
 * `request-quotation/model/exact-money.ts` does the same string work behind a
 * hard-coded `₫` suffix; consolidating the two is a follow-up rather than this
 * checkpoint's business, since APP6's screens are not in its change impact.
 */

/** The Vietnamese thousands separator, as `APP7-D01` sets the amounts. */
const GROUP_SEPARATOR = '.';
const GROUP_SIZE = 3;

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

function groupDigits(digits: string): string {
  let grouped = '';
  for (let index = digits.length; index > 0; index -= GROUP_SIZE) {
    const start = Math.max(0, index - GROUP_SIZE);
    const chunk = digits.slice(start, index);
    grouped = grouped === '' ? chunk : `${chunk}${GROUP_SEPARATOR}${grouped}`;
  }
  return grouped;
}

/**
 * One stored amount, grouped for reading, with no currency mark.
 *
 * Total: an input this cannot parse comes back unchanged, so an unexpected
 * server value is shown as it is rather than replaced by a wrong one.
 */
export function formatGroupedAmount(amount: string): string {
  const match = AMOUNT_PATTERN.exec(amount);
  if (match === null) {
    return amount;
  }
  const [, sign = '', integer = '', fraction] = match;
  // A fraction the schema cannot produce. Show the raw string rather than drop
  // digits that would change what the operator reads.
  if (fraction !== undefined && /[^0]/.test(fraction)) {
    return amount;
  }
  return `${sign}${groupDigits(integer)}`;
}

/** The same amount followed by the currency the server stored it in. */
export function formatAmountWithCurrency(amount: string, currencyCode: string): string {
  return `${formatGroupedAmount(amount)} ${currencyCode}`;
}

/** The shape `APP7-B04`'s `observedAmount` accepts: up to 12 digits, 2 decimals. */
const OBSERVED_AMOUNT_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

/**
 * Whether the server's own money regex would accept this text.
 *
 * A local mirror of the published contract so the operator is told about a
 * malformed amount before a round trip — never a second money authority. The
 * server re-validates and remains the only judge of a refusal, and the text the
 * operator typed is what gets submitted either way.
 */
export function isWellFormedObservedAmount(amount: string): boolean {
  return OBSERVED_AMOUNT_PATTERN.test(amount);
}
