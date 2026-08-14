/**
 * Phone normalization to E.164 (`APP4-P01`, `ADR-APP4-001` §2.2).
 *
 * **No phone-parsing dependency exists in this repository** — checked at
 * `APP4-G01` and again here against every `package.json` and the lockfile: no
 * `libphonenumber-js`, no `google-libphonenumber`, no `awesome-phonenumber`. The
 * checkpoint directive forbids adding one silently, so this is the narrowest
 * correct solution for the rule APP4 actually locked: **E.164 output, Vietnam as
 * the default region, an explicit country code always wins.**
 *
 * What that buys, and what it deliberately does not:
 *
 * - **Structural E.164 validity is enforced** — `+`, a non-zero first digit and
 *   2–15 digits total (ITU-T E.164 §6.2.1).
 * - **National-numbering-plan validity is not.** This cannot tell a real
 *   Vietnamese mobile prefix from an unassigned one, and it makes no attempt to;
 *   a wrong-but-well-formed number simply never receives its code. Full plan
 *   validation is what a real library exists for, and adopting one is a
 *   dependency decision for a later checkpoint, not a side effect of P01.
 *
 * The limitation is recorded rather than hidden because the failure mode is
 * benign in this direction: a number that passes here but is unassigned wastes
 * one delivery attempt, whereas over-strict validation would reject real
 * customers at the door.
 */
import { accepted, rejected, type ContactNormalization } from './contact-value';

/** `ADR-APP4-001` §2.2 — the default region when no country code is given. */
export const DEFAULT_PHONE_REGION = 'VN';

/** Vietnam's ITU calling code, without the `+`. */
export const VN_COUNTRY_CODE = '84';

/**
 * Vietnam's national trunk prefix.
 *
 * `0912345678` dialled inside Vietnam is `+84912345678` internationally: the
 * leading `0` is a domestic access digit, not part of the number, and carrying
 * it into E.164 would produce `+840912345678` — a different, invalid number.
 */
const VN_TRUNK_PREFIX = '0';

/**
 * Separators a person types: whitespace, dots, parentheses, ASCII hyphen and the
 * Unicode dash block `U+2010`–`U+2015` that word processors and phone keyboards
 * substitute. Anything else non-numeric is a rejection, not a silent strip.
 */
const FORMATTING_CHARACTERS = /[\s.()\-‐-―]/g;

/** ITU-T E.164: country code starts 1–9, total national+country digits ≤ 15. */
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

/** `00` in most of the world, and Vietnam's own IDD prefix. */
const INTERNATIONAL_PREFIX = '00';

/**
 * Normalizes a phone number to E.164.
 *
 * Order matters and is fixed: strip formatting, resolve the international
 * prefix, then apply the default region **only** when the caller supplied no
 * country code of their own.
 */
export function normalizePhone(
  raw: string,
  defaultCountryCode = VN_COUNTRY_CODE,
): ContactNormalization {
  const display = raw.trim();
  if (display === '') {
    return rejected('EMPTY');
  }
  // Bound the work before any scanning; 32 characters is far beyond the longest
  // legitimately formatted international number.
  if (display.length > 32) {
    return rejected('TOO_LONG');
  }

  const compact = display.replace(FORMATTING_CHARACTERS, '');
  if (compact === '') {
    return rejected('INVALID_FORMAT');
  }

  // A `+` is meaningful only as the first character; anywhere else it is noise.
  const plusCount = compact.split('+').length - 1;
  if (plusCount > 1 || (plusCount === 1 && !compact.startsWith('+'))) {
    return rejected('INVALID_FORMAT');
  }

  const rest = compact.startsWith('+') ? compact.slice(1) : compact;
  if (!/^\d+$/.test(rest)) {
    return rejected('INVALID_FORMAT');
  }

  const normalized = compact.startsWith('+')
    ? `+${rest}`
    : toInternational(rest, defaultCountryCode);

  if (normalized === undefined || !E164_PATTERN.test(normalized)) {
    return rejected('INVALID_FORMAT');
  }
  return accepted('PHONE', normalized, display);
}

/**
 * Applies the international prefix or the default region to a number typed
 * without a `+`.
 *
 * `00…` is an explicit country code the caller supplied in the other notation,
 * so it wins over the default region exactly as a `+` would.
 */
function toInternational(digits: string, defaultCountryCode: string): string | undefined {
  if (digits.startsWith(INTERNATIONAL_PREFIX)) {
    const international = digits.slice(INTERNATIONAL_PREFIX.length);
    return international === '' ? undefined : `+${international}`;
  }
  if (!/^\d{1,3}$/.test(defaultCountryCode) || defaultCountryCode.startsWith('0')) {
    return undefined;
  }
  const national = digits.startsWith(VN_TRUNK_PREFIX) ? digits.slice(1) : digits;
  return national === '' ? undefined : `+${defaultCountryCode}${national}`;
}
