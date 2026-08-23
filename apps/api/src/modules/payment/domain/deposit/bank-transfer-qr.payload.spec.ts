/**
 * The QR standards and interoperability proof (`APP7-B03` §18).
 *
 * `APP7-G01` §6 left the encoder to this checkpoint and required the risk to be
 * retired here rather than deferred. Two independent proofs do that, and neither
 * is "call `encode()` and inspect the encoder's own input object":
 *
 * 1. **Structural.** The emitted payload is parsed back by the small TLV reader
 *    at the bottom of this file — written from the EMVCo grammar, not imported
 *    from the builder — and every field is checked against the configured
 *    account, the exact amount and the exact reference. The CRC is recomputed
 *    from the standard's own definition against a **published test vector**, so
 *    a checksum bug in the builder cannot hide behind the builder's own
 *    function.
 * 2. **Optical.** `bank-transfer-qr.encoder.spec.ts` renders the PNG, decodes it
 *    with `jsqr` and asserts the decoded string is byte-identical.
 *
 * Docker-free: no database, no container, no network.
 */
import {
  MAX_PURPOSE_LENGTH,
  buildBankTransferQrPayload,
  crc16Ccitt,
  wholeVndDigits,
} from './bank-transfer-qr.payload';
import { depositTransferReference } from './deposit-reference';

const BANK_BIN = '970418';
const ACCOUNT_NUMBER = '31410000123456';
const AMOUNT = '1500000.00';
const REFERENCE = depositTransferReference('ORD-7K3MPQ2XVD');

function payload(): string {
  return buildBankTransferQrPayload({
    bankBin: BANK_BIN,
    accountNumber: ACCOUNT_NUMBER,
    amount: AMOUNT,
    transferReference: REFERENCE,
  });
}

describe('APP7-B03 — CRC-16/CCITT-FALSE', () => {
  it('matches the published check value for the standard', () => {
    // The canonical CRC catalogue vector: CRC-16/CCITT-FALSE of "123456789" is
    // 0x29B1. Asserting against a value published outside this repository is
    // what makes this a conformance proof rather than a regression snapshot.
    expect(crc16Ccitt('123456789')).toBe('29B1');
  });

  it('always emits four uppercase hexadecimal digits', () => {
    for (const sample of ['', 'A', 'the quick brown fox', REFERENCE]) {
      expect(crc16Ccitt(sample)).toMatch(/^[0-9A-F]{4}$/);
    }
  });
});

describe('APP7-B03 — the VND amount field', () => {
  it('carries whole VND digits, with no float anywhere in the path', () => {
    expect(wholeVndDigits('1500000.00')).toBe('1500000');
    expect(wholeVndDigits('999')).toBe('999');
    expect(wholeVndDigits('0000123.00')).toBe('123');
  });

  it.each([
    ['a non-zero minor unit, which VND cannot have', '1500000.25'],
    ['a zero amount', '0.00'],
    ['a negative amount', '-1500000.00'],
    ['a value that is not a decimal at all', '1.5e6'],
  ])('refuses %s rather than encoding it', (_case, amount) => {
    expect(() => wholeVndDigits(amount)).toThrow();
  });
});

describe('APP7-B03 — the bank-transfer QR payload', () => {
  it('decodes back to the exact configured account, amount and reference', () => {
    const fields = parseEmvco(payload());

    expect(fields.get('00')).toBe('01');
    // Dynamic: this payload carries an amount, so a scanning app must not offer
    // an editable one.
    expect(fields.get('01')).toBe('12');
    expect(fields.get('53')).toBe('704');
    expect(fields.get('58')).toBe('VN');

    const merchant = parseEmvco(require_(fields.get('38')));
    expect(merchant.get('00')).toBe('A000000727');
    expect(merchant.get('02')).toBe('QRIBFTTA');

    const beneficiary = parseEmvco(require_(merchant.get('01')));
    expect(beneficiary.get('00')).toBe(BANK_BIN);
    expect(beneficiary.get('01')).toBe(ACCOUNT_NUMBER);

    expect(fields.get('54')).toBe('1500000');

    const additional = parseEmvco(require_(fields.get('62')));
    expect(additional.get('08')).toBe(REFERENCE);
    expect(additional.get('08')).toBe('ORD7K3MPQ2XVDDC');
  });

  it('passes the standard integrity check when verified independently', () => {
    const emitted = payload();
    // Recomputed over everything up to and including "6304", exactly as a
    // scanning application does before it trusts the amount.
    const body = emitted.slice(0, -4);
    expect(body.endsWith('6304')).toBe(true);
    expect(emitted.slice(-4)).toBe(crc16Ccitt(body));
  });

  it('is rejected by the integrity check when a single character is altered', () => {
    const emitted = payload();
    // A tampered amount must not survive: this is the property the CRC exists
    // for, and asserting it proves the checksum actually covers the field.
    const tampered = emitted.replace('1500000', '1000000');
    expect(tampered).not.toBe(emitted);
    expect(tampered.slice(-4)).not.toBe(crc16Ccitt(tampered.slice(0, -4)));
  });

  it('is deterministic, which is why nothing stores it', () => {
    expect(payload()).toBe(payload());
  });

  it('carries transfer instructions only — no URL, token, attempt or provider', () => {
    const emitted = payload();
    for (const forbidden of ['http', 'https', '://', 'token', 'attempt', 'provider', 'checkout']) {
      expect(emitted.toLowerCase()).not.toContain(forbidden);
    }
    // Nor any customer identity: the payload is built from four server-owned
    // values and there is no parameter that could carry a name or a contact.
    expect(buildBankTransferQrPayload).toHaveLength(1);
  });

  it('refuses a reference longer than the standard purpose field', () => {
    expect(REFERENCE.length).toBeLessThanOrEqual(MAX_PURPOSE_LENGTH);
    expect(() =>
      buildBankTransferQrPayload({
        bankBin: BANK_BIN,
        accountNumber: ACCOUNT_NUMBER,
        amount: AMOUNT,
        transferReference: 'X'.repeat(MAX_PURPOSE_LENGTH + 1),
      }),
    ).toThrow();
  });
});

/**
 * An EMVCo TLV reader, written from the grammar rather than imported.
 *
 * Two characters of tag, two decimal digits of length, then exactly that many
 * characters of value. If the builder's lengths were wrong by one this loop
 * would desynchronise and the assertions above would fail, which is the point of
 * parsing rather than string-matching.
 */
function parseEmvco(input: string): Map<string, string> {
  const fields = new Map<string, string>();
  let cursor = 0;
  while (cursor < input.length) {
    const tag = input.slice(cursor, cursor + 2);
    const length = Number.parseInt(input.slice(cursor + 2, cursor + 4), 10);
    expect(Number.isNaN(length)).toBe(false);
    const value = input.slice(cursor + 4, cursor + 4 + length);
    expect(value).toHaveLength(length);
    fields.set(tag, value);
    cursor += 4 + length;
  }
  expect(cursor).toBe(input.length);
  return fields;
}

function require_(value: string | undefined): string {
  expect(value).toBeDefined();
  return value as string;
}
