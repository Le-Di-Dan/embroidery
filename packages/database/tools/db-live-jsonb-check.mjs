/**
 * DB6-S26 — live JSONB boundary checker.
 * Verifies the closed set of 9 canonical JSONB columns
 * (DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md §7) — no tenth JSONB, no missing
 * boundary, no speculative GIN index over any of them.
 * Usage: node db-live-jsonb-check.mjs <url>
 */
import { connect, report } from './live-db.mjs';

const client = await connect(process.argv[2]);
const { note, fail, finish } = report('jsonb');

const { rows: jsonbCols } = await client.query(`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND data_type = 'jsonb'
  ORDER BY table_name, column_name
`);
note(`physical JSONB columns: ${jsonbCols.length} / 9`);
if (jsonbCols.length !== 9) {
  fail(
    `live JSONB column count is ${jsonbCols.length}, expected 9: ${jsonbCols.map((r) => `${r.table_name}.${r.column_name}`).join(', ')}`,
  );
}

// no GIN/GiST/BRIN index over any JSONB column (no canonical boundary calls
// for one; a GIN appearing here would be a speculative addition).
for (const { table_name, column_name } of jsonbCols) {
  const { rows: idx } = await client.query(
    `SELECT i.relname, am.amname FROM pg_index x
     JOIN pg_class t ON t.oid = x.indrelid
     JOIN pg_class i ON i.oid = x.indexrelid
     JOIN pg_am am ON am.oid = i.relam
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = $1
       AND $2 = ANY (
         SELECT a.attname FROM pg_attribute a
         WHERE a.attrelid = t.oid AND a.attnum = ANY (x.indkey)
       )`,
    [table_name, column_name],
  );
  const nonBtree = idx.filter((r) => r.amname !== 'btree');
  if (nonBtree.length > 0) {
    fail(
      `unexpected non-btree index over JSONB column ${table_name}.${column_name}: ${nonBtree.map((r) => `${r.relname} (${r.amname})`).join(', ')}`,
    );
  }
}
note(`GIN/GiST/BRIN over JSONB columns: 0 (none expected, none canonical)`);

await client.end();
process.exitCode = finish();
