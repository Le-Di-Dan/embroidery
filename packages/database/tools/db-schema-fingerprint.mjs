/**
 * DB6-S26 — deterministic schema fingerprint.
 * Normalizes the live catalog (tables, columns/types/nullability/defaults,
 * constraints, indexes, functions, triggers) into a stable JSON document —
 * excluding OIDs, creation timestamps, and any other unstable/physical-
 * storage identifier — and hashes it. Two databases built from the same
 * migration chain must produce an identical fingerprint regardless of
 * fresh-install vs. upgrade history.
 * Usage: node db-schema-fingerprint.mjs <url> [--json]
 */
import { createHash } from 'node:crypto';
import { connect } from './live-db.mjs';

const client = await connect(process.argv[2]);

async function rows(sql) {
  return (await client.query(sql)).rows;
}

const columns = await rows(`
  SELECT table_name, column_name, data_type, is_nullable, column_default,
         numeric_precision, numeric_scale, udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, column_name
`);

const constraints = await rows(`
  SELECT t.relname AS table_name, con.conname, con.contype,
         pg_get_constraintdef(con.oid) AS def
  FROM pg_constraint con
  JOIN pg_class t ON t.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
  ORDER BY t.relname, con.conname
`);

const indexes = await rows(`
  SELECT c.relname AS table_name, i.relname AS index_name,
         pg_get_indexdef(i.oid, 0, false) AS def
  FROM pg_index x
  JOIN pg_class c ON c.oid = x.indrelid
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  ORDER BY c.relname, i.relname
`);

const functions = await rows(`
  SELECT p.proname, pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
  ORDER BY p.proname
`);

const triggers = await rows(`
  SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname = 'public'
  ORDER BY c.relname, t.tgname
`);

await client.end();

const normalized = { columns, constraints, indexes, functions, triggers };
const canonicalJson = JSON.stringify(normalized);
const hash = createHash('sha256').update(canonicalJson).digest('hex');

if (process.argv.includes('--json')) {
  console.log(canonicalJson);
} else {
  console.log(hash);
}
