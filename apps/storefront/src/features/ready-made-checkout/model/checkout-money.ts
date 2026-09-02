/**
 * The one arithmetic this checkout performs, and the reason it is exact
 * (`APP12-S02` §12, §13).
 *
 * The summary card draws a `Tiền hàng` row (`907:211` / `907:213`) beside a
 * `SL n` line, so it states **unit price × quantity**. That is the only figure
 * this screen computes, and it is a *presentation* of the current catalog price
 * — not an order amount. `APP12-B02` re-resolves the price under the stock lock
 * and freezes its own `merchandiseSubtotal`, and nothing computed here is ever
 * sent: `CreateReadyMadeOrderBody` carries a SKU, a quantity, a challenge and a
 * delivery address, and has no field an amount could travel in.
 *
 * ## Why `BigInt` and not a number
 *
 * A VND amount arrives as a decimal string precisely because a JSON number is an
 * IEEE-754 double (`PublicPriceResponse.amount`). Multiplying through
 * `Number(...)` would reintroduce exactly the loss the contract spent a string
 * to avoid — `1250000.10 * 3` is not `3750000.30` in binary floating point — and
 * the resulting figure would then be rendered beside an exact one the server
 * sent. `BigInt` over the amount scaled to its minor units is exact for every
 * value the contract admits (`^-?\d{1,12}(\.\d{1,2})?$`) and for every quantity
 * (`0 < q ≤ 100000`), and the product is formatted back to the same decimal
 * shape it came in.
 *
 * ## An amount this file does not recognise is not multiplied
 *
 * It is returned as `undefined`, and the caller renders the drawn row without a
 * figure rather than with a guess. `formatExactAmount` takes the same position
 * for the same reason: the one way a money module can genuinely mislead is by
 * producing a plausible number from an input it did not understand.
 */

/** Exactly the contract's own amount shape (`numeric(14,2)` as text). */
const AMOUNT_PATTERN = /^(-?)(\d{1,12})(?:\.(\d{1,2}))?$/;

/** VND has no minor unit, but the column is `numeric(14,2)` and may carry one. */
const SCALE = 2;

/**
 * `amount × quantity`, exactly, as a decimal string with the same scale.
 *
 * Returns `undefined` for an amount outside the contract shape or a quantity
 * that is not a positive safe integer — the two cases where there is no honest
 * product to state.
 */
export function multiplyExactAmount(amount: string, quantity: number): string | undefined {
  const match = AMOUNT_PATTERN.exec(amount.trim());
  if (match === null) return undefined;
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return undefined;

  const [, sign = '', whole = '', fraction = ''] = match;
  // Scale to minor units by padding rather than by shifting a float.
  const minor = BigInt(`${whole}${fraction.padEnd(SCALE, '0')}`) * BigInt(quantity);
  const digits = minor.toString().padStart(SCALE + 1, '0');
  const integerPart = digits.slice(0, digits.length - SCALE);
  const fractionPart = digits.slice(digits.length - SCALE);

  // The output keeps the input's own shape: a whole-đồng amount in, a
  // whole-đồng amount out, so the row reads like every other price on the site.
  return fraction === '' ? `${sign}${integerPart}` : `${sign}${integerPart}.${fractionPart}`;
}
