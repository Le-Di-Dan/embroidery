/**
 * DB6-S26 — live money-column scale checker (fills the gap noted by
 * DB6_MONEY_SCALE_AUDIT.md §8: "an equivalent money-side checker is future
 * tooling work, not implemented in this slice").
 *
 * Every money column must be numeric(14,2), never float/real/double, and
 * every row-currency-scoped amount must carry a `ck_*_currency_scale`
 * CHECK enforcing the VND-integer rule.
 * Usage: node db-live-money-check.mjs <url>
 */
import { connect, report } from './live-db.mjs';

const client = await connect(process.argv[2]);
const { note, fail, finish } = report('money');

const { rows: moneyCols } = await client.query(`
  SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name ILIKE '%amount%'
  ORDER BY table_name, column_name
`);
note(`money-shaped columns (name LIKE %amount%): ${moneyCols.length}`);

for (const c of moneyCols) {
  if (c.data_type !== 'numeric') {
    fail(`${c.table_name}.${c.column_name} is ${c.data_type}, expected numeric (never float/real/double)`);
    continue;
  }
  if (c.numeric_precision !== 14 || c.numeric_scale !== 2) {
    fail(`${c.table_name}.${c.column_name} is numeric(${c.numeric_precision},${c.numeric_scale}), expected numeric(14,2)`);
  }
}

// every money-shaped table with its own currency_code column must have at
// least one ck_*_currency_scale CHECK per amount column; payment_reconciliations
// is the documented exception (no row currency column, uses the unconditional form).
const tablesWithMoney = [...new Set(moneyCols.map((c) => c.table_name))];
for (const table of tablesWithMoney) {
  const { rows: checks } = await client.query(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class t ON t.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = $1 AND con.contype = 'c'
       AND con.conname LIKE '%currency_scale%'`,
    [table],
  );
  const amountCols = moneyCols.filter((c) => c.table_name === table);
  if (checks.length < amountCols.length) {
    fail(`${table}: ${amountCols.length} amount column(s) but only ${checks.length} currency-scale CHECK(s)`);
  }
  for (const chk of checks) {
    if (/now\(|current_date|current_timestamp/i.test(chk.def)) {
      fail(`${table}.${chk.conname} currency-scale CHECK contains a volatile expression: ${chk.def}`);
    }
  }
}
note(`tables with money columns: ${tablesWithMoney.length}, all carry a matching currency-scale CHECK`);

await client.end();
process.exitCode = finish();
