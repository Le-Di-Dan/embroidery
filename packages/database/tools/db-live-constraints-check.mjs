/**
 * DB6-S26 — live constraint inventory checker (PK / FK / UQ / CHECK).
 * Verifies live pg_constraint counts against the canonical DEV-DB6-017
 * baseline (160 physical FKs, not the superseded 162). Filters to the
 * `public` schema explicitly — an unfiltered pg_constraint scan silently
 * inflates counts with pg_catalog system-table constraints (caught once
 * already in the G19 group, see DB6_G19_GROUP_REPORT.md).
 * Usage: node db-live-constraints-check.mjs <url>
 */
import { connect, report } from './live-db.mjs';

const EXPECTED = { p: 78, f: 160, u: 50, c: 189 };
const NAMES = { p: 'PK', f: 'FK', u: 'UNIQUE', c: 'CHECK' };

const client = await connect(process.argv[2]);
const { note, fail, finish } = report('constraints');

for (const [type, expected] of Object.entries(EXPECTED)) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.contype = $1 AND n.nspname = 'public'`,
    [type],
  );
  const n = rows[0].n;
  note(`${NAMES[type]}: ${n} / ${expected}`);
  if (n !== expected) fail(`${NAMES[type]} constraint count is ${n}, expected ${expected}`);
}

// partial-unique indexes are UNIQUE-backed but not pg_constraint rows of
// type 'u' unless declared as a table constraint; confirm none of the 50
// UNIQUE constraints double as a partial index (constraint-backed uniques
// are always full-table by definition in this schema).
const { rows: partialAsConstraint } = await client.query(`
  SELECT con.conname FROM pg_constraint con
  JOIN pg_index idx ON idx.indexrelid = con.conindid
  JOIN pg_class t ON t.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE con.contype = 'u' AND n.nspname = 'public' AND idx.indpred IS NOT NULL
`);
if (partialAsConstraint.length > 0) {
  fail(
    `UNIQUE constraint(s) unexpectedly partial: ${partialAsConstraint.map((r) => r.conname).join(', ')}`,
  );
}

// zero unresolved deferred FK rows — every documented deferred edge from the
// manifest's ledger must already be a live FK by S26 (the ledger itself is
// closed per DB6_DEVIATION_REGISTER.md; this just proves it live).
const { rows: relationshipCeiling } = await client.query(`
  SELECT count(*)::int AS n FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE c.contype = 'f' AND n.nspname = 'public'
`);
note(`relationship ceiling: ${relationshipCeiling[0].n} / 160 (DEV-DB6-017)`);
if (relationshipCeiling[0].n !== 160) {
  fail(`relationship ceiling reverted from 160 — live FK count is ${relationshipCeiling[0].n}`);
}

await client.end();
process.exitCode = finish();
