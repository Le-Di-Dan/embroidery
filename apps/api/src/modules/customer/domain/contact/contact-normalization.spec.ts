/**
 * Contact normalization and masking (`APP4-P01`, `ADR-APP4-001` §2).
 *
 * The prohibitions are tested as hard as the transformations. `+tag` survival
 * and dot survival are not stylistic preferences — each one is an identity that
 * `customer_contact_points` would otherwise merge, so a regression here silently
 * joins two customers rather than failing loudly.
 */
import { normalizeEmail } from './normalize-email';
import { normalizePhone, parsePhone } from './normalize-phone';
import { maskContact, MASK_RUN } from './mask-contact';
import type { ContactNormalization } from './contact-value';

function normalized(result: ContactNormalization): string {
  if (!result.ok) throw new Error(`expected acceptance, got ${result.reason}`);
  return result.contact.normalized;
}
function reason(result: ContactNormalization): string {
  if (result.ok) throw new Error(`expected rejection, got "${result.contact.normalized}"`);
  return result.reason;
}

describe('normalizeEmail', () => {
  it.each([
    ['AN@Vidu.COM', 'an@vidu.com'],
    ['  an@vidu.com  ', 'an@vidu.com'],
    [' an@vidu.com ', 'an@vidu.com'],
    ['AN@VIDU.COM', 'an@vidu.com'],
  ])('trims and lowercases %s', (input, expected) => {
    expect(normalized(normalizeEmail(input))).toBe(expected);
  });

  it('preserves a plus-tag: stripping it would merge two customers', () => {
    expect(normalized(normalizeEmail('An+Shop@Vidu.com'))).toBe('an+shop@vidu.com');
  });

  it('preserves dots in the local part', () => {
    expect(normalized(normalizeEmail('a.b.c@vidu.com'))).toBe('a.b.c@vidu.com');
  });

  it('applies no provider-specific rewrite', () => {
    expect(normalized(normalizeEmail('a.b+x@googlemail.com'))).toBe('a.b+x@googlemail.com');
    expect(normalized(normalizeEmail('a.b@gmail.com'))).toBe('a.b@gmail.com');
  });

  it('keeps the as-entered value separately for display', () => {
    const result = normalizeEmail('  An@Vidu.com ');
    expect(result.ok && result.contact.display).toBe('An@Vidu.com');
    expect(result.ok && result.contact.kind).toBe('EMAIL');
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['an', 'INVALID_FORMAT'],
    ['an@', 'INVALID_FORMAT'],
    ['@vidu.com', 'INVALID_FORMAT'],
    ['an@vidu', 'INVALID_FORMAT'],
    ['an@@vidu.com', 'INVALID_FORMAT'],
    ['an vidu@vidu.com', 'INVALID_FORMAT'],
    ['an@vidu .com', 'INVALID_FORMAT'],
  ])('rejects %s as %s', (input, expected) => {
    expect(reason(normalizeEmail(input))).toBe(expected);
  });

  it('rejects an address longer than the RFC 5321 path limit', () => {
    expect(reason(normalizeEmail(`${'a'.repeat(250)}@vidu.com`))).toBe('TOO_LONG');
  });

  it('rejects a local part longer than 64 octets even inside the path limit', () => {
    expect(reason(normalizeEmail(`${'a'.repeat(65)}@vidu.com`))).toBe('TOO_LONG');
  });
});

describe('normalizePhone', () => {
  it.each([
    ['0912345678', '+84912345678'],
    ['0912 345 678', '+84912345678'],
    ['091-234-5678', '+84912345678'],
    ['(091) 234 5678', '+84912345678'],
    ['091–234–5678', '+84912345678'],
  ])('normalizes the Vietnamese national form %s', (input, expected) => {
    expect(normalized(normalizePhone(input))).toBe(expected);
  });

  it('leaves an already-canonical Vietnamese number unchanged', () => {
    expect(normalized(normalizePhone('+84912345678'))).toBe('+84912345678');
  });

  it('drops the trunk zero rather than carrying it into E.164', () => {
    // `+840912345678` would be a different, invalid number.
    expect(normalized(normalizePhone('0912345678'))).not.toContain('+840');
    expect(normalized(normalizePhone('912345678'))).toBe('+84912345678');
  });

  it.each([
    ['+14155550123', '+14155550123'],
    ['+442071838750', '+442071838750'],
    ['+81312345678', '+81312345678'],
    ['+35020012345', '+35020012345'],
    ['+37120123456', '+37120123456'],
    ['+998901234567', '+998901234567'],
  ])('preserves the explicit country code of %s', (input, expected) => {
    expect(normalized(normalizePhone(input))).toBe(expected);
  });

  it.each([
    ['0014155550123', '+14155550123'],
    ['0084912345678', '+84912345678'],
    ['00350 20012345', '+35020012345'],
  ])('treats the 00 prefix in %s as an explicit country code', (input, expected) => {
    expect(normalized(normalizePhone(input))).toBe(expected);
  });

  it('keeps the as-entered value separately for display', () => {
    const result = normalizePhone('0912 345 678');
    expect(result.ok && result.contact.display).toBe('0912 345 678');
    expect(result.ok && result.contact.kind).toBe('PHONE');
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['abc', 'INVALID_FORMAT'],
    ['+84 912 34a 678', 'INVALID_FORMAT'],
    ['++84912345678', 'INVALID_FORMAT'],
    ['84+912345678', 'INVALID_FORMAT'],
    ['+0912345678', 'INVALID_FORMAT'],
    ['+8', 'INVALID_FORMAT'],
    ['+849123456789012345', 'INVALID_FORMAT'],
    // Non-empty as typed, but nothing survives formatting removal.
    ['()-  ', 'INVALID_FORMAT'],
  ])('rejects %s as %s', (input, expected) => {
    expect(reason(normalizePhone(input))).toBe(expected);
  });

  it('rejects an over-long input before scanning it', () => {
    expect(reason(normalizePhone('0'.repeat(40)))).toBe('TOO_LONG');
  });
});

describe('maskContact — email', () => {
  it.each([
    ['alice@vidu.com', 'a***@vidu.com'],
    ['a@vidu.com', 'a***@vidu.com'],
    ['nguyen.minh.an@vidu.com', 'n***@vidu.com'],
  ])('masks %s to %s', (input, expected) => {
    expect(maskContact('EMAIL', input)).toBe(expected);
  });

  it('reveals one whole code point, not half a surrogate pair', () => {
    // U+1F600 is astral: slice(0, 1) would emit a lone high surrogate.
    const masked = maskContact('EMAIL', '\u{1F600}clair@vidu.com');
    expect(masked).toBe('\u{1F600}***@vidu.com');
    expect(Array.from(masked)[0]).toBe('\u{1F600}');
  });

  it('reveals a non-ASCII first code point intact', () => {
    expect(maskContact('EMAIL', 'éclair@vidu.com')).toBe('é***@vidu.com');
  });

  it('never returns the full normalized address', () => {
    for (const address of ['alice@vidu.com', 'a@vidu.com', 'éclair@vidu.com']) {
      expect(maskContact('EMAIL', address)).not.toBe(address);
    }
  });

  it('withholds everything when the value is not a maskable address', () => {
    expect(maskContact('EMAIL', 'not-an-address')).toBe(MASK_RUN);
    expect(maskContact('EMAIL', '@vidu.com')).toBe(MASK_RUN);
    expect(maskContact('EMAIL', 'alice@')).toBe(MASK_RUN);
  });
});

describe('maskContact — phone', () => {
  /**
   * Every calling-code length, with two different three-digit codes so the
   * implementation cannot pass by special-casing one of them.
   *
   * `APP4-P01-C1` exists because the previous version guessed this split and
   * masked a digit of the country code itself for every three-digit code.
   */
  const CASES: ReadonlyArray<[string, string]> = [
    ['+14155550123', '1'], // 1-digit: US
    ['+79123456789', '7'], // 1-digit: RU
    ['+84912345678', '84'], // 2-digit: VN
    ['+442071838750', '44'], // 2-digit: GB
    ['+35020012345', '350'], // 3-digit: GI
    ['+37120123456', '371'], // 3-digit: LV
    ['+998901234567', '998'], // 3-digit: UZ
  ];

  it('renders the locked example exactly', () => {
    expect(maskContact('PHONE', '+84912345678')).toBe('+84 ***** 5678');
  });

  it.each(CASES)('exposes the complete country calling code of %s', (e164, callingCode) => {
    const parsed = parsePhone(e164);
    expect(parsed?.countryCallingCode).toBe(callingCode);
    expect(maskContact('PHONE', e164).startsWith(`+${callingCode} `)).toBe(true);
  });

  it.each(CASES)('exposes only the final four national digits of %s', (e164) => {
    const parsed = parsePhone(e164);
    const national = parsed?.nationalNumber ?? '';
    expect(maskContact('PHONE', e164).endsWith(national.slice(-4))).toBe(true);
  });

  it.each(CASES)('leaks no earlier national digit of %s', (e164, callingCode) => {
    const parsed = parsePhone(e164);
    const national = parsed?.nationalNumber ?? '';
    const masked = maskContact('PHONE', e164);
    // Everything the output may contain: the calling code and the last four.
    expect(masked.replace(/[^\d]/g, '')).toBe(`${callingCode}${national.slice(-4)}`);
    // The hidden prefix must be exactly as long as the digits it replaces.
    expect(masked.split(' ')[1]).toBe('*'.repeat(national.length - 4));
  });

  it.each(CASES)('never returns the full normalized value for %s', (e164) => {
    const masked = maskContact('PHONE', e164);
    expect(masked).not.toBe(e164);
    expect(masked.replace(/[^\d+]/g, '')).not.toBe(e164);
  });

  it('withholds everything for a value that is not canonical E.164', () => {
    expect(maskContact('PHONE', '84912345678')).toBe(MASK_RUN);
    expect(maskContact('PHONE', '+84 912 345 678')).toBe(MASK_RUN);
    expect(maskContact('PHONE', '+0912345678')).toBe(MASK_RUN);
    expect(maskContact('PHONE', '')).toBe(MASK_RUN);
  });

  it('withholds everything for a well-shaped but unparseable number', () => {
    // Structurally E.164, but no country claims calling code 999.
    expect(maskContact('PHONE', '+9991234567890')).toBe(MASK_RUN);
  });

  it('withholds everything when the national number is too short to mask', () => {
    expect(maskContact('PHONE', '+845678')).toBe(MASK_RUN);
  });
});
