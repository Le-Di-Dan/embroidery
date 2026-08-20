/**
 * Exact VND arithmetic for quotation pricing (`APP6-G01` §6.2).
 *
 * Money is `numeric(14,2)` in PostgreSQL and a **string** everywhere above it.
 * The rule this file exists to keep is blunt: no amount that is persisted or
 * displayed ever becomes a JS `number`. `parseFloat('0.1') + parseFloat('0.2')`
 * is the whole argument — a quotation total that lost a unit is a price the
 * customer did not agree to.
 *
 * So amounts are carried as `bigint` **hundredths** of a VND. `bigint` is exact
 * at every magnitude `numeric(14,2)` can hold, the parse is a string scan rather
 * than a numeric conversion, and the only way back out is
 * {@link formatVndAmount}, which produces the two-decimal form the column
 * stores.
 *
 * ### Why hundredths when VND has no minor unit
 *
 * The column is `numeric(14,2)`, so the *storage* scale is two decimals even
 * though the *currency* has none. Working in hundredths matches the column and
 * lets {@link parseVndAmount} accept either spelling an operator or a client
 * might send (`1500000` or `1500000.00`). The currency rule is enforced
 * separately by {@link isWholeVnd}, which mirrors the database's own
 * `ck_..._currency_scale` CHECK (`amount = trunc(amount)` for VND) so a
 * fractional đồng is refused as bad input rather than as a constraint violation.
 *
 * Nothing here reads policy or knows a percentage. The deposit share arrives as
 * a parsed value from the published `quotation.deposit` policy; this module only
 * applies it exactly.
 */

/** Hundredths of one VND. The only in-memory representation of an amount. */
export type VndAmount = bigint & { readonly __brand: 'VndAmount' };

const HUNDREDTHS = 100n;
/** `numeric(14,2)` — twelve integer digits, two fractional. */
const MAX_HUNDREDTHS = 10n ** 14n - 1n;

const DECIMAL_PATTERN = /^-?\d{1,12}(?:\.\d{1,2})?$/;

export const ZERO_VND = 0n as VndAmount;

/**
 * Parses a decimal string into hundredths, or `undefined` if it is not one.
 *
 * Deliberately strict: no exponent, no thousands separator, no leading `+`, no
 * whitespace, at most two fractional digits and at most twelve integer digits.
 * A looser parser would accept `1e6` and quietly agree with a client that meant
 * something else. `undefined` rather than a throw, because every caller is
 * validating client input and wants a refusal, not an exception.
 */
export function parseVndAmount(text: string): VndAmount | undefined {
  if (!DECIMAL_PATTERN.test(text)) {
    return undefined;
  }
  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = digits.split('.');
  const hundredths = BigInt(whole) * HUNDREDTHS + BigInt(fraction.padEnd(2, '0'));
  if (hundredths > MAX_HUNDREDTHS) {
    return undefined;
  }
  return (negative ? -hundredths : hundredths) as VndAmount;
}

/** The two-decimal form `numeric(14,2)` stores. The only way out of `bigint`. */
export function formatVndAmount(amount: VndAmount): string {
  const negative = amount < 0n;
  // `0n - amount` rather than `-amount`: the brand makes the unary form an
  // unsafe negation to the linter, and the subtraction is the same value.
  const magnitude: bigint = negative ? 0n - amount : amount;
  const whole = magnitude / HUNDREDTHS;
  const fraction = magnitude % HUNDREDTHS;
  return `${negative ? '-' : ''}${String(whole)}.${String(fraction).padStart(2, '0')}`;
}

/** Whether the amount is a whole đồng — the database's VND scale rule. */
export function isWholeVnd(amount: VndAmount): boolean {
  return amount % HUNDREDTHS === 0n;
}

/** Whether the amount still fits `numeric(14,2)` after arithmetic. */
export function fitsVndColumn(amount: VndAmount): boolean {
  return amount <= MAX_HUNDREDTHS && amount >= -MAX_HUNDREDTHS;
}

export function addVnd(...amounts: readonly VndAmount[]): VndAmount {
  return amounts.reduce((total, amount) => total + amount, 0n) as VndAmount;
}

export function subtractVnd(minuend: VndAmount, subtrahend: VndAmount): VndAmount {
  return (minuend - subtrahend) as VndAmount;
}

/**
 * `unitPrice × quantity` — a line total.
 *
 * `quantity` is an integer count from a validated body, never an amount, so
 * converting it to `bigint` loses nothing.
 */
export function multiplyVnd(unitPrice: VndAmount, quantity: number): VndAmount {
  return (unitPrice * BigInt(quantity)) as VndAmount;
}

/**
 * A percentage share of an amount, **rounded half up to a whole đồng**.
 *
 * The rounding rule is not a choice made here:
 * `DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md` specifies "round-half-up on
 * deposit; remaining = total − deposit" for exactly this split, and
 * `ck_quotation_versions__deposit_currency_scale` requires the result to be a
 * whole đồng. The complement is always computed by subtraction, never by
 * applying the remaining percentage, which is what keeps
 * `deposit_amount + remaining_amount = total_amount` (CST-064) true for every
 * total rather than for the ones that happen to divide evenly.
 *
 * `percentHundredths` is the share in hundredths of a percent, matching
 * `deposit_percent numeric(5,2)`.
 *
 * Both inputs are non-negative here (a total is CHECK-constrained `>= 0` and a
 * percentage is `0..100`), so half-up is a plain `+ half, then floor`.
 */
export function percentageOfVnd(amount: VndAmount, percentHundredths: bigint): VndAmount {
  // amount is hundredths-of-đồng; percentHundredths is hundredths-of-percent.
  // A whole-đồng result therefore divides by 100 (percent) × 100 (percent
  // scale) × 100 (đồng scale) = 1_000_000, then scales back up to hundredths.
  const denominator = 1_000_000n;
  const numerator = amount * percentHundredths;
  const wholeDong = (numerator + denominator / 2n) / denominator;
  return (wholeDong * HUNDREDTHS) as VndAmount;
}

/**
 * Parses a percentage from published policy into hundredths of a percent.
 *
 * The policy value arrives as a JSON number, which is the one place a `number`
 * legitimately appears: it is a *rate*, not an amount, and it is converted to
 * exact hundredths here before it can touch a total. Rejects anything that is
 * not a finite value in `0..100` with at most two decimals — the domain of
 * `deposit_percent numeric(5,2)`.
 */
export function parsePercentHundredths(value: unknown): bigint | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  // Via the decimal string rather than `value * 100`: 40.7 * 100 is 4070.0000000000005.
  const text = String(value);
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) {
    return undefined;
  }
  const [whole = '0', fraction = ''] = text.split('.');
  const hundredths = BigInt(whole) * HUNDREDTHS + BigInt(fraction.padEnd(2, '0'));
  return hundredths > 100n * HUNDREDTHS ? undefined : hundredths;
}

/** The two-decimal form `deposit_percent numeric(5,2)` stores. */
export function formatPercent(percentHundredths: bigint): string {
  return formatVndAmount(percentHundredths as VndAmount);
}
