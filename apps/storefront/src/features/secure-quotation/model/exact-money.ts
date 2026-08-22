/**
 * Displaying an exact VND amount without ever computing one (`APP6-G01` §6.2,
 * `APP6-S01` §16).
 *
 * Every figure on this screen belongs to the server: the line totals, the
 * subtotal, the manual adjustment, the shipping fee, the total, the deposit
 * split and the remainder. They arrive as decimal **strings** because a VND
 * total through an IEEE-754 double is precision loss no later formatting can
 * undo, and because `APP6-B04` returns them exactly as they were frozen onto
 * the version row.
 *
 * So this module does string work and nothing else. There is no `Number(...)`,
 * no `parseFloat`, no `parseInt`, no unary `+`, no `Math.round` and no
 * arithmetic operator applied to an amount anywhere in this feature. The
 * grouping below walks the integer digits from the right and inserts
 * separators; it cannot change the value it was handed, and an input it does
 * not recognise comes back untouched rather than guessed at.
 *
 * ### Why this is a Storefront file and not an import
 *
 * `APP6-A01` has the same rules in `apps/admin`. Importing one app's feature
 * into the other would couple two deployables through a screen module, which
 * `CLAUDE.md` §5 places at the wrong scope — the shared thing is the *rule*,
 * and the rule is short enough to state twice than to promote to a package for
 * two callers. If a third surface ever needs it, that is the moment it becomes
 * a workspace package.
 *
 * ### Why the decimals are dropped, and why that is not rounding
 *
 * VND has no minor unit and `APP6-B01` refuses any amount that is not a whole
 * đồng before it is ever stored, so a persisted amount's fraction is always
 * `.00`. The formatter shows the integer part alone. When the fraction is *not*
 * all zeros the amount is something this system never wrote, and the string is
 * returned verbatim instead of truncated: hiding a non-zero fraction would be
 * the one way this file could misreport a figure.
 */

/** The Vietnamese thousands separator, as `APP6-D01` sets the amounts. */
const GROUP_SEPARATOR = '.';
const GROUP_SIZE = 3;
/**
 * The typographic minus the approved totals use (`700:43`).
 *
 * A substitution of one character for another in the *rendered* text. The
 * value is untouched: a negative adjustment stays negative, and nothing here
 * can turn it into a positive one.
 */
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
 * The same amount with its currency mark, for the figures the design labels.
 *
 * The code comes from the response (`APP6-B04` fixes it to `VND`) rather than
 * from a constant here, so this screen states the currency the server priced
 * in instead of asserting one of its own.
 */
export function formatExactMoney(amount: string, currencyCode: string): string {
  return `${formatExactAmount(amount)} ${currencyCode}`;
}

/**
 * A stored `numeric(5,2)` percentage, as text.
 *
 * `depositPercent` is the share **this version was priced at**, read back from
 * the version row. It is never recomputed from today's policy and never divided
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
 * Whether a stored amount is zero, decided by looking at its digits.
 *
 * Used only to decide whether the manual-adjustment row is worth showing at
 * all — a question about the recorded text, not about a computed value. `'0'`,
 * `'0.00'` and `'-0.00'` are all "no adjustment", and no numeric conversion
 * takes place to establish that.
 */
export function isZeroAmount(amount: string): boolean {
  const match = AMOUNT_PATTERN.exec(amount.trim());
  if (match === null) {
    return false;
  }
  const [, , integer = '', fraction = ''] = match;
  return !/[^0]/.test(integer) && !/[^0]/.test(fraction);
}
