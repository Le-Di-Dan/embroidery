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

import { parsePhone } from './normalize-phone';

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
 * The shape a stored `normalized_value` must have before it is worth parsing.
 *
 * The masker's input contract is the **normalized** value, so a raw or
 * partly-formatted number is refused here rather than quietly parsed. Without
 * this guard `+84 912 345 678` and `84912345678` would both parse and mask
 * successfully, which would make "pass the normalized value" advice rather than
 * a contract.
 */
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

/**
 * E.164 → the exact country calling code, a masked national prefix, and the
 * final four national digits.
 *
 * **Corrected by `APP4-P01-C1`.** The previous version guessed the country-code
 * length from the E.164 zone — one digit for zones 1 and 7, two otherwise — and
 * therefore masked one digit *of the country code itself* for every three-digit
 * code (`+350`, `+371`, `+998`). The acceptance criterion is "preserve the
 * country code", and a guess that is usually right does not satisfy it.
 *
 * The split now comes from `libphonenumber-js` via the shared `parsePhone`, so
 * `countryCallingCode` and `nationalNumber` are the library's exact values for
 * every calling-code length. The four visible digits are the last four of the
 * **national number**, never of the E.164 string — for a country whose national
 * number is shorter than four digits those would not be the same thing.
 */
function maskPhone(normalizedValue: string): string {
  if (!E164_PATTERN.test(normalizedValue)) {
    return MASK_RUN;
  }
  const parsed = parsePhone(normalizedValue);
  if (parsed === undefined) {
    return MASK_RUN;
  }

  const national = parsed.nationalNumber;
  // Country code, at least one masked digit, and the four visible ones. Anything
  // shorter is withheld entirely rather than published with no masked middle.
  if (national.length <= PHONE_VISIBLE_DIGITS) {
    return MASK_RUN;
  }

  const visible = national.slice(-PHONE_VISIBLE_DIGITS);
  const hidden = PHONE_MASK_GLYPH.repeat(national.length - PHONE_VISIBLE_DIGITS);
  return `+${parsed.countryCallingCode} ${hidden} ${visible}`;
}
