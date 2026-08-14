/**
 * Contact masking (`APP4-P01`, `ADR-APP4-001` §2.3).
 *
 * This is what `notification_intents.recipient_masked` stores and what every
 * Admin support screen renders. The column exists so an operator can *recognise*
 * a recipient without the record becoming a contact database, so the one rule
 * that matters is the negative one: **the full normalized destination is never
 * produced here**, and `maskContact` output must never equal its input.
 *
 * Masking is deterministic — the same input always yields the same mask — and it
 * is one-way. It is presentation-safe identity, not a reversible encoding.
 */
import type { ContactKind } from '@embroidery/database';

/** The run of characters standing in for everything withheld. */
export const MASK_RUN = '***';

/**
 * The glyph repeated across a phone number's hidden middle.
 *
 * `*` because no masking convention predates this checkpoint; the `APP4-D01`
 * frames render `•`, which is a mock-up choice rather than implementation
 * authority. Named here so switching it is a one-line change if a reviewer
 * prefers the drawn glyph.
 */
export const PHONE_MASK_GLYPH = '*';

/** `ADR-APP4-001` §2.3: the last four digits of a phone number stay visible. */
export const PHONE_VISIBLE_DIGITS = 4;

/**
 * Masks a normalized contact value.
 *
 * Takes the **normalized** value on purpose: masking the as-entered copy would
 * leak whatever casing or spacing the customer typed, and two spellings of one
 * address would produce two different masks for one identity.
 */
export function maskContact(kind: ContactKind, normalizedValue: string): string {
  return kind === 'EMAIL' ? maskEmail(normalizedValue) : maskPhone(normalizedValue);
}

/**
 * `local@domain` → first code point of the local part, `***`, then the domain.
 *
 * `Array.from` iterates **code points**, not UTF-16 code units, so a local part
 * beginning with an astral character (an emoji, or a rarer CJK extension glyph)
 * yields that whole character rather than a lone surrogate half. Slicing by
 * index would emit an unpaired surrogate — a broken character in every Admin
 * table that renders it.
 *
 * A single-character local part is safe by construction: the first code point is
 * revealed and the remainder is empty, so `a@vidu.com` masks to `a***@vidu.com`
 * and still differs from its input.
 */
function maskEmail(normalizedValue: string): string {
  const separator = normalizedValue.lastIndexOf('@');
  if (separator <= 0) {
    // Not a shape this function can mask safely. Withhold everything rather
    // than pass an unrecognised value through.
    return MASK_RUN;
  }
  const local = normalizedValue.slice(0, separator);
  const domain = normalizedValue.slice(separator + 1);
  const [firstCodePoint] = Array.from(local);
  if (firstCodePoint === undefined || domain === '') {
    return MASK_RUN;
  }
  return `${firstCodePoint}${MASK_RUN}@${domain}`;
}

/**
 * E.164 → country code, a masked middle, and the final four digits.
 *
 * Splitting the country code from the national number is the part that normally
 * needs a full ITU table, which this repository does not have. The rule used
 * instead is the E.164 zone structure: zones **1** and **7** are single-digit
 * codes, everything else is treated as two digits.
 *
 * That is exact for `+84`, which is the only code this product issues by
 * default, and for every other one- and two-digit code. For a three-digit code
 * it reveals one digit **fewer** than the true country code — and that direction
 * is the safe one: the missing digit falls into the masked middle, so the mask
 * can under-disclose but never over-disclose. A table-driven split can replace
 * this the day a phone library is adopted, with no change to the contract.
 */
function maskPhone(normalizedValue: string): string {
  if (!normalizedValue.startsWith('+')) {
    return MASK_RUN;
  }
  const digits = normalizedValue.slice(1);
  if (!/^\d+$/.test(digits)) {
    return MASK_RUN;
  }

  const countryCodeLength = digits.startsWith('1') || digits.startsWith('7') ? 1 : 2;
  // Every digit must still be accounted for: country code, at least one masked
  // digit, and the four visible ones. Anything shorter is withheld entirely
  // rather than published with a too-short middle.
  if (digits.length < countryCodeLength + 1 + PHONE_VISIBLE_DIGITS) {
    return MASK_RUN;
  }

  const countryCode = digits.slice(0, countryCodeLength);
  const visible = digits.slice(-PHONE_VISIBLE_DIGITS);
  const hiddenCount = digits.length - countryCodeLength - PHONE_VISIBLE_DIGITS;
  return `+${countryCode} ${PHONE_MASK_GLYPH.repeat(hiddenCount)} ${visible}`;
}
