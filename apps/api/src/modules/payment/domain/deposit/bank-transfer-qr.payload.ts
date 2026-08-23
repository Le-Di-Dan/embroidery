/**
 * The Vietnamese bank-transfer QR payload (`APP7-G01` §6, `APP7-B03` §16).
 *
 * An EMVCo *Merchant-Presented Mode* payload carrying the NAPAS VietQR
 * account-transfer (`QRIBFTTA`) template. It encodes **transfer instructions**
 * and nothing else: the merchant's bank, the merchant's account, the exact
 * deposit amount and the derived transfer reference. There is no checkout
 * session, no application URL, no grant or payment token, no attempt id and no
 * evidence link — the payload has nowhere to put one, because every field below
 * is written explicitly.
 *
 * ### The structure, and why exactly these tags
 *
 * ```text
 * 00 Payload Format Indicator      "01"
 * 01 Point of Initiation Method    "12"  dynamic — this payload carries an amount
 * 38 Merchant Account Information
 *    00 Globally Unique Identifier "A000000727"  NAPAS
 *    01 Beneficiary Organization
 *       00 Acquirer id             the merchant bank BIN
 *       01 Beneficiary account     the merchant account number
 *    02 Service code               "QRIBFTTA"    transfer to account
 * 53 Transaction Currency          "704"          VND, ISO 4217 numeric
 * 54 Transaction Amount            the exact obligation amount, whole VND
 * 58 Country Code                  "VN"
 * 62 Additional Data Field Template
 *    08 Purpose of Transaction      the DEPOSIT transfer reference
 * 63 CRC                            CRC-16/CCITT-FALSE over everything, including "6304"
 * ```
 *
 * EMVCo lists tags 59 (Merchant Name) and 60 (Merchant City) as mandatory for a
 * *merchant* payment. This is not one: `QRIBFTTA` is an inter-bank funds
 * transfer to a named account, the beneficiary is already identified inside tag
 * 38 by acquirer and account number, and the interoperable payloads Vietnamese
 * banking applications are known to accept for this service code omit both. So
 * the account-holder name is **not** encoded — `APP7-B03` §16 admits
 * account-holder information only where the selected standard requires it, and
 * here it would be a second, unauthoritative spelling of the beneficiary that a
 * bank would ignore. The name still reaches the customer, in the deposit
 * instructions, where a human reads it.
 *
 * ### Nothing here is caller-editable
 *
 * {@link BankTransferQrInput} has four fields and every one is server-owned:
 * three come from the fail-fast merchant configuration and one from the frozen
 * DEPOSIT obligation. No amount, account, bank or memo can arrive from a request
 * body, because there is no parameter that would carry one.
 *
 * ### Amount
 *
 * VND has no minor unit — `ck_payment_obligations__amount_currency_scale`
 * enforces it physically — so the obligation's `numeric(14,2)` string always has
 * a zero fraction and the field carries the whole-number digits. The conversion
 * is string surgery with an explicit check, never `Number()`: money that passed
 * through a float is money the business cannot defend, and this value is what
 * the customer's bank will actually move.
 */

/** NAPAS's EMVCo globally unique identifier. */
const NAPAS_GUID = 'A000000727';

/** Inter-Bank Funds Transfer, To Account. */
const SERVICE_CODE_TO_ACCOUNT = 'QRIBFTTA';

/** ISO 4217 numeric for VND, which is the only currency APP7 obligations use. */
const VND_NUMERIC_CODE = '704';

const COUNTRY_CODE = 'VN';

/** EMVCo tag 62 sub-tag 08. Bounded at 25 characters by the standard. */
export const MAX_PURPOSE_LENGTH = 25;

export interface BankTransferQrInput {
  /** NAPAS acquirer id — six digits, validated by the configuration provider. */
  readonly bankBin: string;
  /** The receiving account number. */
  readonly accountNumber: string;
  /** The obligation's own `numeric(14,2)` amount string, as stored. */
  readonly amount: string;
  /** The derived transfer reference; nothing customer-supplied. */
  readonly transferReference: string;
}

/**
 * Builds the complete payload, CRC included.
 *
 * Deterministic: the same inputs always produce the same string, which is what
 * makes storing the QR unnecessary.
 */
export function buildBankTransferQrPayload(input: BankTransferQrInput): string {
  if (input.transferReference.length > MAX_PURPOSE_LENGTH) {
    throw new Error('The transfer reference is longer than the QR purpose field allows.');
  }

  const beneficiary = tlv('00', input.bankBin) + tlv('01', input.accountNumber);
  const merchantAccount =
    tlv('00', NAPAS_GUID) + tlv('01', beneficiary) + tlv('02', SERVICE_CODE_TO_ACCOUNT);

  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchantAccount) +
    tlv('53', VND_NUMERIC_CODE) +
    tlv('54', wholeVndDigits(input.amount)) +
    tlv('58', COUNTRY_CODE) +
    tlv('62', tlv('08', input.transferReference));

  // The CRC covers the tag and length of field 63 itself, which is why the
  // literal "6304" is appended before the checksum is computed.
  const withCrcHeader = `${body}63${'04'}`;
  return `${withCrcHeader}${crc16Ccitt(withCrcHeader)}`;
}

/**
 * One EMVCo tag-length-value triplet.
 *
 * The length is two decimal digits, so a value longer than 99 characters cannot
 * be represented and is a defect rather than a truncation.
 */
function tlv(tag: string, value: string): string {
  if (value.length > 99) {
    throw new Error(`QR field ${tag} is longer than the EMVCo length prefix can express.`);
  }
  return `${tag}${value.length.toString().padStart(2, '0')}${value}`;
}

/**
 * The obligation amount as whole VND digits.
 *
 * Accepts the stored `numeric(14,2)` shape and refuses a non-zero fraction: VND
 * has no minor unit, so a fractional amount here means the row contradicts
 * `ck_payment_obligations__amount_currency_scale` and encoding it would put a
 * figure into a bank transfer that the obligation does not owe.
 */
export function wholeVndDigits(amount: string): string {
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(amount);
  if (match === null) {
    throw new Error('A deposit amount that is not a plain decimal cannot be encoded.');
  }
  const [, integerPart, fraction] = match;
  if (fraction !== undefined && /[1-9]/.test(fraction)) {
    throw new Error('A VND amount with a non-zero fraction cannot be encoded.');
  }
  // Leading zeros would still decode to the same number, but a bank app shows
  // the field verbatim in some flows; the canonical digits are what is sent.
  const digits = (integerPart as string).replace(/^0+(?=[0-9])/, '');
  if (digits === '0') {
    throw new Error('A zero deposit amount cannot be encoded.');
  }
  return digits;
}

/**
 * CRC-16/CCITT-FALSE — polynomial `0x1021`, initial value `0xFFFF`, no input or
 * output reflection, no final XOR. Four uppercase hexadecimal digits.
 *
 * This is the checksum EMVCo specifies, and it is what a scanning application
 * verifies before it will show the customer an amount. It is computed here
 * rather than taken from a library so the bytes hashed are exactly the bytes
 * emitted.
 */
export function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
