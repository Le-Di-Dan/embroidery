/**
 * Whole-đồng price handling for the B02 `basePriceAmount` contract.
 *
 * The wire value is a decimal *string*, never a JSON number: đồng amounts can
 * exceed what a double represents exactly, so this module never converts through
 * `Number` on the way to the server. Parsing, validating and formatting all
 * operate on digits.
 *
 * The sentinel matters as much as the format. A DRAFT carries `"0"` to mean
 * "no price set yet", so `0` must never render as a completed `0 ₫` — the input
 * shows empty and a blank input maps back to `"0"` (handoff `521:284` — Giá cơ
 * bản).
 */
import { PRODUCT_FORM_COPY } from './product-form-copy';

/** The B02 draft sentinel: a price that has not been decided. */
export const PRICE_NOT_SET = '0';

/** The contract's digit ceiling for `basePriceAmount`. */
export const PRICE_MAX_DIGITS = 12;

const DIGITS_ONLY = /^\d+$/;

/** Strips leading zeros but keeps a single `0`. `"000450"` → `"450"`. */
function stripLeadingZeros(digits: string): string {
  const trimmed = digits.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

/**
 * True when the value is a legal `basePriceAmount`: 1–12 digits, no sign, no
 * separator, no decimal point. Non-strings and anything else are rejected.
 */
export function isValidPriceAmount(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= PRICE_MAX_DIGITS &&
    DIGITS_ONLY.test(value)
  );
}

/** True when the wire value means "the operator has not set a price". */
export function isPriceUnset(amount: unknown): boolean {
  return !isValidPriceAmount(amount) || stripLeadingZeros(amount) === '0';
}

/**
 * The value the price input shows for a wire amount. The `"0"` sentinel and any
 * unusable value render as an empty field, so the operator is never told a
 * price of zero was chosen deliberately.
 */
export function priceAmountToInput(amount: unknown): string {
  return isPriceUnset(amount) ? '' : stripLeadingZeros(amount as string);
}

/**
 * The wire value for what the operator typed. A blank field is the sentinel
 * `"0"`; anything else is normalized to bare digits. Returns `null` when the
 * input cannot be a legal amount, which the caller surfaces as the approved
 * validation message rather than sending a rejected request.
 */
export function inputToPriceAmount(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return PRICE_NOT_SET;
  }
  if (!DIGITS_ONLY.test(trimmed)) {
    return null;
  }
  const normalized = stripLeadingZeros(trimmed);
  return normalized.length > PRICE_MAX_DIGITS ? null : normalized;
}

/**
 * Grouped đồng for read-only display, e.g. `450000` → `450.000 ₫`. Grouping is
 * applied to the digit string directly — no `Intl`, no float. Returns neutral
 * copy for the unset sentinel so no screen renders `0 ₫` as a real price.
 */
export function formatPriceAmount(amount: unknown): string {
  if (isPriceUnset(amount)) {
    return PRODUCT_FORM_COPY.identity.metaUnavailable;
  }
  const digits = stripLeadingZeros(amount as string);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped} ₫`;
}
