/**
 * The merchant bank configuration provider (`APP7-G01` §3, `APP7-B03` §13).
 *
 * Docker-free: no database, no container, no network. Every value below is
 * synthetic.
 */
import {
  MERCHANT_ACCOUNT_NAME_ENV,
  MERCHANT_ACCOUNT_NUMBER_ENV,
  MERCHANT_BANK_BIN_ENV,
  MERCHANT_BANK_DISPLAY_NAME_ENV,
  loadMerchantBankConfig,
} from './merchant-bank.config';

const VALID: NodeJS.ProcessEnv = {
  PAYMENT_MERCHANT_BANK_BIN: '970418',
  PAYMENT_MERCHANT_ACCOUNT_NUMBER: '31410000123456',
  PAYMENT_MERCHANT_ACCOUNT_NAME: 'CONG TY TNHH THEU TEST',
  PAYMENT_MERCHANT_BANK_DISPLAY_NAME: 'Ngan Hang Test',
};

/** `CLAUDE.md` §8a's protected substrings, restated so the rule is asserted. */
const PROTECTED_SECRET_SUBSTRINGS = [
  'PASSWORD',
  'PASSWD',
  'SECRET',
  'TOKEN',
  'KEY',
  'CREDENTIAL',
  'PRIVATE',
];

const LOCKED_NAMES = [
  MERCHANT_BANK_BIN_ENV,
  MERCHANT_ACCOUNT_NUMBER_ENV,
  MERCHANT_ACCOUNT_NAME_ENV,
  MERCHANT_BANK_DISPLAY_NAME_ENV,
];

describe('APP7-B03 — the merchant bank configuration', () => {
  it('reads exactly the four variable names APP7-G01 locked', () => {
    expect(LOCKED_NAMES).toEqual([
      'PAYMENT_MERCHANT_BANK_BIN',
      'PAYMENT_MERCHANT_ACCOUNT_NUMBER',
      'PAYMENT_MERCHANT_ACCOUNT_NAME',
      'PAYMENT_MERCHANT_BANK_DISPLAY_NAME',
    ]);
  });

  it('keeps every name outside the CLAUDE.md §8a protected pattern', () => {
    // Not a style preference. These values are printed on the customer's screen
    // and encoded into the QR they scan; naming one as a secret would mark a
    // customer-visible fact as a credential and pull it into `.env-ignore`.
    for (const name of LOCKED_NAMES) {
      for (const substring of PROTECTED_SECRET_SUBSTRINGS) {
        expect(name).not.toContain(substring);
      }
    }
  });

  it('loads all four values and trims surrounding whitespace', () => {
    const config = loadMerchantBankConfig({ ...VALID, PAYMENT_MERCHANT_BANK_BIN: ' 970418 ' });
    expect(config).toEqual({
      bankBin: '970418',
      accountNumber: '31410000123456',
      accountName: 'CONG TY TNHH THEU TEST',
      bankDisplayName: 'Ngan Hang Test',
    });
  });

  it.each(LOCKED_NAMES)('fails fast when %s is missing', (name) => {
    const env = { ...VALID };
    delete env[name];
    expect(() => loadMerchantBankConfig(env)).toThrow(name);
  });

  it.each(LOCKED_NAMES)('fails fast when %s is blank', (name) => {
    expect(() => loadMerchantBankConfig({ ...VALID, [name]: '   ' })).toThrow(name);
  });

  it.each([
    ['a five-digit BIN', '97041'],
    ['a seven-digit BIN', '9704180'],
    ['a non-numeric BIN', '97041A'],
  ])('rejects %s — a wrong bank sends the money elsewhere', (_case, bankBin) => {
    expect(() => loadMerchantBankConfig({ ...VALID, PAYMENT_MERCHANT_BANK_BIN: bankBin })).toThrow(
      MERCHANT_BANK_BIN_ENV,
    );
  });

  it.each([
    ['too short', '12345'],
    ['too long', '12345678901234567890'],
    ['non-numeric', '3141-0000-123456'],
  ])('rejects an account number that is %s', (_case, accountNumber) => {
    expect(() =>
      loadMerchantBankConfig({ ...VALID, PAYMENT_MERCHANT_ACCOUNT_NUMBER: accountNumber }),
    ).toThrow(MERCHANT_ACCOUNT_NUMBER_ENV);
  });

  it('has no default and no development shortcut', () => {
    // An empty environment must not produce a usable account. A fallback here
    // would let a deployment ship a deposit surface pointing at nothing, or at
    // whatever a placeholder happened to say.
    expect(() => loadMerchantBankConfig({})).toThrow();
    expect(() => loadMerchantBankConfig({ NODE_ENV: 'development' })).toThrow();
    expect(() => loadMerchantBankConfig({ NODE_ENV: 'production' })).toThrow();
  });

  it('never puts a value into the message it raises', () => {
    // The failure reaches a startup log. Quoting the account number there would
    // put the merchant's account into every log aggregator downstream.
    for (const [name, value] of Object.entries(VALID)) {
      let message = '';
      try {
        loadMerchantBankConfig({ ...VALID, [name]: `${value}-INVALID!` });
      } catch (error: unknown) {
        message = (error as Error).message;
      }
      if (message !== '') {
        expect(message).not.toContain(value);
      }
    }
  });
});
