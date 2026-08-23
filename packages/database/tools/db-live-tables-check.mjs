/**
 * DB6-S26 — live table/column inventory checker.
 * Verifies the live catalog on a disposable database matches the canonical
 * 79-table / 853-column baseline (78 tables and 833 columns at DB6 launch,
 * + 10 columns from APP3-DB01 + 2 from APP5-DB01 + 4 from APP6-DB01, and
 * + 1 table / 4 columns from APP7-DB01's `payment_transfer_evidence`).
 * Usage: node db-live-tables-check.mjs <url>
 */
import { connect, report } from './live-db.mjs';

const EXPECTED_TABLES = 79;
const EXPECTED_COLUMNS = 853;

const client = await connect(process.argv[2]);
const { note, fail, finish } = report('tables');

const { rows: tables } = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
`);
if (tables.length !== EXPECTED_TABLES) {
  fail(`live table count is ${tables.length}, expected ${EXPECTED_TABLES}`);
}
note(`tables: ${tables.length} / ${EXPECTED_TABLES}`);

const dupNames = tables.map((t) => t.table_name).filter((n, i, a) => a.indexOf(n) !== i);
if (dupNames.length > 0) fail(`duplicate table name(s): ${dupNames.join(', ')}`);

const { rows: colCount } = await client.query(`
  SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public'
`);
if (colCount[0].n !== EXPECTED_COLUMNS) {
  fail(`live column count is ${colCount[0].n}, expected ${EXPECTED_COLUMNS}`);
}
note(`columns: ${colCount[0].n} / ${EXPECTED_COLUMNS}`);

const { rows: noPk } = await client.query(`
  SELECT c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint p WHERE p.conrelid = c.oid AND p.contype = 'p'
    )
`);
if (noPk.length > 0)
  fail(`table(s) without a primary key: ${noPk.map((r) => r.relname).join(', ')}`);

await client.end();
process.exitCode = finish();
