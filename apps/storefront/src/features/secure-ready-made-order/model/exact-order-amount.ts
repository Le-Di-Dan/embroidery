/**
 * Displaying a Ready-Made amount without ever computing one (`APP12-S03` §15,
 * §16).
 *
 * The highlighted figure on this screen is the FULL obligation's **own** amount
 * — `CustomerFullPaymentResponse.fullPaymentAmount`, which `APP12-B04` reads
 * off the obligation row that `APP12-B03` composed once from the frozen
 * merchandise subtotal and the exact shipping fee. This module therefore has no
 * arithmetic in it at all, and no file in this feature applies an operator to
 * money.
 *
 * That absence is load-bearing rather than incidental. Three plausible
 * derivations are each forbidden by §15, and each would be wrong in a way the
 * screen could not detect:
 *
 * ```text
 * subtotal + fee                 disagrees after a fee correction recomposes
 *                                the obligation rather than adjusting it
 * total − deposit                a Ready-Made order has no deposit (BR-029)
 * unit price × quantity + fee     re-derives a figure the order froze
 * ```
 *
 * The order projection's `merchandiseSubtotal` and `delivery.feeAmount` are
 * still rendered — the approved frame draws them as two supporting rows
 * (`910:298`, `910:302`) — but they are *displayed beside* the total, never
 * summed into it. The contract says so in as many words: `payableTotal` "is the
 * authoritative total; it is not re-derived from the two fields above".
 *
 * The value arrives as a decimal **string** because a VND amount through an
 * IEEE-754 double is precision loss no later formatting can undo. This module
 * therefore does string work and nothing else: no `Number(...)`, no
 * `parseFloat`, no `parseInt`, no unary `+`, no `Math.round`, no `toFixed`. The
 * grouping below walks the integer digits from the right and inserts
 * separators; it cannot change the value it was handed, and an input it does
 * not recognise comes back untouched rather than guessed at.
 *
 * ### Why the decimals are dropped, and why that is not rounding
 *
 * VND has no minor unit and the amount is refused before it is ever stored
 * unless it is a whole đồng, so a persisted amount's fraction is always `.00`.
 * The formatter shows the integer part alone. When the fraction is *not* all
 * zeros the amount is something this system never wrote, and the string is
 * returned verbatim instead of truncated — hiding a non-zero fraction would be
 * the one way this file could misreport a figure.
 *
 * ### Why this is a fifth statement of the rule in the repository
 *
 * `APP6-S01`, `APP7-S01`, `APP7-A01` and `APP9-S01` each state it inside their
 * own boundary. Promoting one would move a delivered module out from under its
 * own guard — each feature's boundary suite proves *that directory* contains no
 * numeric coercion by scanning it, and a file that left the directory would
 * leave the guard. Promoting the helper is not this checkpoint's to make, so
 * this feature's boundary suite scans this file with the same rule and the
 * duplication is carried as `FU-APP9-S01-01`'s fifth instance.
 */

/** The Vietnamese thousands separator, as every approved amount is set. */
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
 * (`910:297` — `1.285.000 VND`).
 *
 * The currency comes from the response beside the amount it belongs to and is
 * never assumed to be `VND` by this function, even though the obligation
 * enforces it physically.
 */
export function formatExactMoney(amount: string, currencyCode: string): string {
  return `${formatExactAmount(amount)} ${currencyCode}`;
}
