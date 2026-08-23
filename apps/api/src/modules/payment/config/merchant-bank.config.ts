/**
 * The one merchant bank account APP7 deposits are transferred to
 * (`APP7-G01` §3, `APP7-B03`).
 *
 * `MERCHANT_BANK_CONFIG_CLASS = SERVER_CONTROLLED_SENSITIVE_OPERATIONAL_CONFIGURATION`.
 * A module-scoped, fail-fast provider on the delivered
 * `design-session-auth.config.ts` pattern: read once when the module is
 * composed, throw on a missing or malformed value, no default and no
 * development shortcut.
 *
 * ### The four names are `APP7-G01`'s, and none of them is a secret name
 *
 * `CLAUDE.md` §8a protects any variable whose name contains `PASSWORD`,
 * `PASSWD`, `SECRET`, `TOKEN`, `KEY`, `CREDENTIAL` or `PRIVATE`. None of the
 * four below does, deliberately: these values are printed on the customer's own
 * deposit screen and encoded into the QR they scan, so they are operational
 * configuration, not credentials. Renaming one into the protected pattern would
 * falsely mark a customer-visible fact as a secret, so `APP7-G01` forbids it and
 * this file does not do it.
 *
 * There is no bank API credential in this MVP. No API key, merchant secret,
 * webhook secret, provider token or signing key is declared or read here.
 *
 * ### What the values may and may not do
 *
 * They reach the customer only through the deposit representation the API
 * returns and through the QR payload built from them. They are never written to
 * a log, an audit detail, an error payload or an outbox payload, and the
 * validation errors below name the **variable** and never the value.
 */

export const MERCHANT_BANK_CONFIG = Symbol('MERCHANT_BANK_CONFIG');

/** The four `APP7-G01` §3 variable names, verbatim. Not renameable. */
export const MERCHANT_BANK_BIN_ENV = 'PAYMENT_MERCHANT_BANK_BIN';
export const MERCHANT_ACCOUNT_NUMBER_ENV = 'PAYMENT_MERCHANT_ACCOUNT_NUMBER';
export const MERCHANT_ACCOUNT_NAME_ENV = 'PAYMENT_MERCHANT_ACCOUNT_NAME';
export const MERCHANT_BANK_DISPLAY_NAME_ENV = 'PAYMENT_MERCHANT_BANK_DISPLAY_NAME';

/**
 * A NAPAS acquirer id is exactly six digits.
 *
 * Validated rather than accepted, because a BIN with a stray space or a missing
 * digit produces a QR that scans and then names the wrong bank — a failure the
 * customer discovers only after their money has left.
 */
const BANK_BIN_PATTERN = /^[0-9]{6}$/;

/** Vietnamese account numbers are digits; length varies by bank. */
const ACCOUNT_NUMBER_PATTERN = /^[0-9]{6,19}$/;

/** The longest account-holder name the deposit instructions will carry. */
export const MAX_ACCOUNT_NAME_LENGTH = 70;

export interface MerchantBankConfig {
  /** The NAPAS acquirer id the QR standard encodes. */
  readonly bankBin: string;
  /** The receiving account number. */
  readonly accountNumber: string;
  /** The account holder, as the bank shows it. */
  readonly accountName: string;
  /** The human bank name shown beside the account in the instructions. */
  readonly bankDisplayName: string;
}

/**
 * Loads and validates all four values, or throws.
 *
 * Every failure names only the variable. A message that quoted the value would
 * put an account number into a startup log, which is the one place this
 * configuration must never appear.
 */
export function loadMerchantBankConfig(env: NodeJS.ProcessEnv): MerchantBankConfig {
  const bankBin = required(env, MERCHANT_BANK_BIN_ENV);
  if (!BANK_BIN_PATTERN.test(bankBin)) {
    throw new Error(`${MERCHANT_BANK_BIN_ENV} must be exactly six digits.`);
  }

  const accountNumber = required(env, MERCHANT_ACCOUNT_NUMBER_ENV);
  if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
    throw new Error(`${MERCHANT_ACCOUNT_NUMBER_ENV} must be 6 to 19 digits.`);
  }

  const accountName = required(env, MERCHANT_ACCOUNT_NAME_ENV);
  if (accountName.length > MAX_ACCOUNT_NAME_LENGTH) {
    throw new Error(
      `${MERCHANT_ACCOUNT_NAME_ENV} must be at most ${String(MAX_ACCOUNT_NAME_LENGTH)} characters.`,
    );
  }

  return {
    bankBin,
    accountNumber,
    accountName,
    bankDisplayName: required(env, MERCHANT_BANK_DISPLAY_NAME_ENV),
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      `${name} is required: the deposit surface has no default merchant account and no fallback.`,
    );
  }
  return raw.trim();
}
