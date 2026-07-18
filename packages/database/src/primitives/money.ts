/**
 * Money primitives (ADR-DB4-001, DB4 money model, DEV-DB6-005).
 *
 * Money is `numeric(14,2)` paired with a row-level `currency_code` — never a
 * float (INV-11). `numeric` is returned by the driver as a string so no value
 * ever passes through a binary floating-point representation; the application
 * Money value object owns arithmetic, not the database.
 *
 * VND has no minor unit, so `numeric(14,2)` alone would permit an amount like
 * `1000.25 VND` that cannot exist. {@link currencyScaleCheck} rejects it. The
 * rule is conditional on the currency rather than global, so adding a currency
 * with minor units later needs no change to stored data or column types.
 */
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { char, numeric } from 'drizzle-orm/pg-core';

const MONEY_PRECISION = 14;
const MONEY_SCALE = 2;

/** Currencies with no minor unit: amounts must be whole numbers. */
const ZERO_DECIMAL_CURRENCIES = ['VND'] as const;

/** A money amount column, e.g. `total_amount`. */
export function amount(name: string) {
  return numeric(name, { precision: MONEY_PRECISION, scale: MONEY_SCALE });
}

/** ISO 4217 currency code accompanying an amount on the same row. */
export function currencyCode(name = 'currency_code') {
  return char(name, { length: 3 });
}

/** `amount >= 0` — the default for balances and totals. */
export function nonNegativeAmountCheck(column: AnyPgColumn) {
  return sql`${column} >= 0`;
}

/** `amount > 0` — for obligations, attempts and refunds, which cannot be zero. */
export function positiveAmountCheck(column: AnyPgColumn) {
  return sql`${column} > 0`;
}

/**
 * Rejects fractional amounts for zero-decimal currencies (DEV-DB6-005).
 *
 * Emits, for VND: `currency_code <> 'VND' OR amount = trunc(amount)`.
 * Rows in any other currency are unaffected.
 */
export function currencyScaleCheck(amountColumn: AnyPgColumn, currencyColumn: AnyPgColumn) {
  // sql.raw, not interpolation: DDL cannot carry bound parameters, and an
  // interpolated value would be written into the migration as `$1`.
  const zeroDecimal = sql.join(
    ZERO_DECIMAL_CURRENCIES.map((code) => sql.raw(`'${code}'`)),
    sql`, `,
  );
  return sql`${currencyColumn} not in (${zeroDecimal}) or ${amountColumn} = trunc(${amountColumn})`;
}
