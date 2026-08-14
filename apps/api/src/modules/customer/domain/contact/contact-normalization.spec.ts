/**
 * Contact normalization and masking (`APP4-P01`, `ADR-APP4-001` §2).
 *
 * The prohibitions are tested as hard as the transformations. `+tag` survival
 * and dot survival are not stylistic preferences — each one is an identity that
 * `customer_contact_points` would otherwise merge, so a regression here silently
 * joins two customers rather than failing loudly.
 */
import { normalizeEmail } from './normalize-email';
import { normalizePhone } from './normalize-phone';
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
  ])('preserves the explicit country code of %s', (input, expected) => {
    expect(normalized(normalizePhone(input))).toBe(expected);
  });

  it('treats a 00 prefix as an explicit country code, not a Vietnamese trunk call', () => {
    expect(normalized(normalizePhone('0014155550123'))).toBe('+14155550123');
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
  it('preserves the country code and the final four digits only', () => {
    expect(maskContact('PHONE', '+84912345678')).toBe('+84 ***** 5678');
  });

  it('treats zone 1 and zone 7 as single-digit country codes', () => {
    expect(maskContact('PHONE', '+14155550123')).toBe('+1 ****** 0123');
    expect(maskContact('PHONE', '+79123456789')).toBe('+7 ****** 6789');
  });

  it('hides every intermediate digit', () => {
    const masked = maskContact('PHONE', '+84912345678');
    expect(masked).not.toContain('9123');
    expect(masked.replace(/[^\d]/g, '')).toBe('845678');
  });

  it('never returns the full normalized number', () => {
    for (const number of ['+84912345678', '+14155550123', '+442071838750']) {
      expect(maskContact('PHONE', number)).not.toBe(number);
    }
  });

  it('withholds everything when the value is too short to mask safely', () => {
    // Country code + at least one hidden digit + four visible digits.
    expect(maskContact('PHONE', '+845678')).toBe(MASK_RUN);
    expect(maskContact('PHONE', '84912345678')).toBe(MASK_RUN);
    expect(maskContact('PHONE', '+84 912 345 678')).toBe(MASK_RUN);
  });
});
