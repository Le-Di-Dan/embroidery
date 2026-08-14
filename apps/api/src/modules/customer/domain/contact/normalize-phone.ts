/**
 * Phone normalization to E.164 (`APP4-P01`, corrected by `APP4-P01-C1`;
 * `ADR-APP4-001` §2.2).
 *
 * **Correction note (`APP4-P01-C1`).** The first implementation parsed by hand
 * and split the country calling code with a heuristic — one digit for zones 1
 * and 7, two for everything else. That was disclosed rather than hidden, and
 * disclosure did not make it correct: for a real three-digit calling code
 * (`+350`, `+371`, `+998`) it masked one digit *of the country code itself*,
 * which is not "preserve the country code". `APP4-P01-C1` authorized
 * `libphonenumber-js` as the single approved phone dependency, and the heuristic
 * is gone rather than patched.
 *
 * This module is now the **one** place APP4 parses a phone number.
 * `mask-contact.ts` imports `parsePhone` from here rather than parsing its own,
 * so normalization and masking cannot disagree about what a country code is.
 *
 * Validation level is deliberately **possible-number**, not valid-number and
 * certainly not carrier lookup (`ADR-APP4-001` §2.2, `APP4-P01-C1` §4.4): the
 * verification challenge is what proves deliverability. `isPossible()` rejects
 * the structurally impossible — wrong length for the country, no country code at
 * all — while accepting a well-formed number whose exact prefix allocation this
 * product has no business adjudicating.
 */
import { parsePhoneNumberFromString, type CountryCode, type PhoneNumber } from 'libphonenumber-js';

import { accepted, rejected, type ContactNormalization } from './contact-value';

/** `ADR-APP4-001` §2.2 — the default region when no country code is given. */
export const DEFAULT_PHONE_REGION: CountryCode = 'VN';

/**
 * Cheap bound applied before parsing.
 *
 * E.164 allows 15 digits; 32 characters leaves generous room for `+`, spaces,
 * hyphens and parentheses while refusing a paste of something else entirely.
 */
const MAX_RAW_LENGTH = 32;

/**
 * Parses a phone number, or returns `undefined`.
 *
 * The library returns `undefined` for unparseable input rather than throwing,
 * but the `try` is not decorative: this function's contract is that a malformed
 * contact never reaches a public caller as an exception, and that contract
 * should not depend on a dependency's future error behaviour.
 */
export function parsePhone(value: string, defaultRegion?: CountryCode): PhoneNumber | undefined {
  try {
    return parsePhoneNumberFromString(value, defaultRegion);
  } catch {
    return undefined;
  }
}

/**
 * Normalizes a phone number to canonical E.164.
 *
 * The library resolves all three input forms the ADR requires, so none of them
 * needs hand-rolled preprocessing:
 *
 * - `0912345678` — national, with Vietnam's trunk `0` stripped by the VN plan;
 * - `+84912345678` — already international, returned unchanged;
 * - `0084912345678` — `00` is Vietnam's IDD prefix, so an explicit country code
 *   supplied this way wins over the default region exactly as `+` does.
 *
 * The canonical value is the library's own `number`, never a string this module
 * assembles: reconstructing it by hand is how the previous version drifted.
 */
export function normalizePhone(
  raw: string,
  defaultRegion: CountryCode = DEFAULT_PHONE_REGION,
): ContactNormalization {
  const display = raw.trim();
  if (display === '') {
    return rejected('EMPTY');
  }
  if (display.length > MAX_RAW_LENGTH) {
    return rejected('TOO_LONG');
  }

  const parsed = parsePhone(display, defaultRegion);
  if (parsed === undefined || !parsed.isPossible()) {
    return rejected('INVALID_FORMAT');
  }
  return accepted('PHONE', parsed.number, display);
}
