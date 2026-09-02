/**
 * Displaying an exact VND amount without ever computing one (`APP12-S01` §13).
 *
 * The price on this panel belongs entirely to the server: `APP12-B01` resolves
 * `COALESCE(skus.price_override_amount, products.base_price_amount)` in the
 * domain and publishes it as a `PublicPriceResponse` — a decimal **string** plus
 * the currency of whichever row supplied the amount. This module does string
 * work and nothing else: there is no `Number(...)`, no `parseFloat`, no unary
 * `+` and no arithmetic operator applied to an amount anywhere in this feature.
 * It cannot change the value it was handed, and an input it does not recognise
 * comes back untouched rather than guessed at.
 *
 * ### Why this is a fourth copy and not an import
 *
 * `secure-quotation`, `secure-deposit-payment` and `secure-final-payment` each
 * carry the same rules already, and each records the same reasoning: the shared
 * thing is the *rule*, and a screen module is the wrong scope to couple features
 * through. Four consumers in one app is the moment that argument stops holding —
 * but moving the other three is unrelated refactoring this checkpoint may not do
 * (`CLAUDE.md` §7). Promotion to `apps/storefront/src/shared` is recorded as
 * `FU-APP12-S01-02` for a checkpoint that owns all four call sites.
 */

/** The Vietnamese thousands separator, as `APP12-D01` sets the amount (`904:42`). */
const GROUP_SEPARATOR = '.';
const GROUP_SIZE = 3;

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
 * One published amount, grouped for reading.
 *
 * VND has no minor unit and the catalog refuses any amount that is not a whole
 * đồng before it is stored, so a persisted amount's fraction is always `.00` and
 * the integer part alone is shown. When the fraction is *not* all zeros the
 * amount is something this system never wrote, and the string is returned
 * verbatim instead of truncated: hiding a non-zero fraction would be the one way
 * this file could misreport a price.
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
  return `${sign}${groupDigits(integer)}`;
}

/**
 * The amount with its currency mark, exactly as `904:42` sets it.
 *
 * The code comes from the response rather than from a constant here, so the
 * panel states the currency the server priced in instead of asserting one of its
 * own — the same reason `APP12-B01` reads the currency column of whichever row
 * supplied the amount instead of writing `'VND'` in.
 */
export function formatExactMoney(amount: string, currencyCode: string): string {
  return `${formatExactAmount(amount)} ${currencyCode}`;
}
