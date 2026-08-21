/**
 * Displaying an exact VND amount without ever computing one (`APP6-G01` §6.2,
 * `APP6-A01` §8).
 *
 * The server owns every figure on this screen: the line totals, the subtotal,
 * the total, the deposit split and the remainder. They arrive as decimal
 * *strings* because a VND total through an IEEE-754 double is precision loss
 * that no later formatting can undo.
 *
 * So this module does string work and nothing else. There is no `Number(...)`,
 * no `parseFloat`, no `parseInt`, no unary `+`, no `Math.round` and no
 * arithmetic operator applied to an amount anywhere in this feature. The
 * grouping below walks the integer digits from the right and inserts separators;
 * it cannot change the value it was handed, and a digit it does not recognise
 * makes it return the input untouched rather than guess.
 *
 * ### Why the decimals are dropped, and why that is not rounding
 *
 * VND has no minor unit, and `APP6-B01` refuses any amount that is not a whole
 * đồng before it is ever stored — so a persisted amount's decimals are always
 * `.00`. The formatter therefore shows the integer part alone. When the fraction
 * is *not* all zeros the amount is something this system never wrote, and the
 * string is returned verbatim instead of being truncated: hiding a non-zero
 * fraction would be the one way this file could misreport a figure.
 */

/** The Vietnamese thousands separator, as `APP6-D01` sets the amounts. */
const GROUP_SEPARATOR = '.';
const GROUP_SIZE = 3;
const CURRENCY_SUFFIX = '₫';

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
 * One stored amount, grouped for reading.
 *
 * Total: an input this cannot parse comes back unchanged, so an unexpected
 * server value is shown as it is rather than replaced by a wrong one.
 */
export function formatExactAmount(amount: string): string {
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

/** The same amount with its currency mark, for the figures the design labels. */
export function formatExactMoney(amount: string): string {
  return `${formatExactAmount(amount)} ${CURRENCY_SUFFIX}`;
}

/**
 * A stored `numeric(5,2)` percentage, as text.
 *
 * `depositPercent` is the share **this version was priced at**, read back from
 * the version row. It is never recomputed from today's policy, and never divided
 * or multiplied here — a trailing `.00` is trimmed and nothing else happens.
 */
export function formatExactPercent(percent: string): string {
  const match = /^(-?\d+)(?:\.(\d+))?$/.exec(percent);
  if (match === null) {
    return percent;
  }
  const [, integer = '', fraction] = match;
  if (fraction === undefined || !/[^0]/.test(fraction)) {
    return `${integer}%`;
  }
  return `${integer}.${fraction.replace(/0+$/, '')}%`;
}

/**
 * Whether an operator-entered amount is one the server will accept as non-zero.
 *
 * Used only to decide whether the **adjustment reason** is required, which is a
 * question about the text the operator typed and not about a computed value. It
 * compares digits: `'0'`, `'0.00'`, `'-0'` and `''` are all "no adjustment", and
 * no numeric conversion takes place to establish that.
 */
export function isZeroAmount(amount: string): boolean {
  const trimmed = amount.trim();
  if (trimmed === '') {
    return true;
  }
  const match = AMOUNT_PATTERN.exec(trimmed);
  if (match === null) {
    return false;
  }
  const [, , integer = '', fraction = ''] = match;
  return !/[^0]/.test(integer) && !/[^0]/.test(fraction);
}

/** The shape `APP6-B01`'s `moneySchema` accepts: up to 12 digits, 2 decimals. */
const SERVER_MONEY_PATTERN = /^-?\d{1,12}(?:\.\d{1,2})?$/;

/**
 * Whether the server's own money regex would accept this text.
 *
 * A local mirror of the published contract so the operator is told about a
 * malformed amount before a round trip — never a second pricing authority. The
 * server re-validates every field and remains the only judge of a refusal.
 */
export function isWellFormedAmount(amount: string): boolean {
  return SERVER_MONEY_PATTERN.test(amount.trim());
}
