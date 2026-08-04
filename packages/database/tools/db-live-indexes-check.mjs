/**
 * DB6-S26 — live index inventory checker.
 * Verifies the post-S25 canonical split (DB6_INDEX_IMPLEMENTATION_MANIFEST.md
 * §7, plus APP3-DB01): 213 total / 46 partial (13 partial-unique + 33 partial-performance) /
 * 37 non-partial performance. This is the corrected split, not the stale
 * pre-S25 45/32/38 estimate — do not revert to it.
 * Usage: node db-live-indexes-check.mjs <url>
 */
import { connect, report } from './live-db.mjs';

const client = await connect(process.argv[2]);
const { note, fail, finish } = report('indexes');

const { rows: total } = await client.query(`
  SELECT count(*)::int AS n FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'i' AND n.nspname = 'public'
`);
note(`total physical indexes: ${total[0].n} / 213`);
if (total[0].n !== 213) fail(`total physical index count is ${total[0].n}, expected 213`);

const classify = async (label, expected, where) => {
  const { rows } = await client.query(`
    SELECT count(*)::int AS n FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND ${where}
  `);
  note(`${label}: ${rows[0].n} / ${expected}`);
  if (rows[0].n !== expected) fail(`${label} count is ${rows[0].n}, expected ${expected}`);
};

await classify('PK backing', 78, `i.indisprimary`);
await classify(
  'UNIQUE backing (non-partial)',
  52,
  `i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL`,
);
await classify(
  'partial unique',
  13,
  `i.indisunique AND NOT i.indisprimary AND i.indpred IS NOT NULL`,
);
await classify('partial performance', 33, `NOT i.indisunique AND i.indpred IS NOT NULL`);
await classify(
  'non-partial performance',
  37,
  `NOT i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL`,
);
await classify('physical partial (total)', 46, `i.indpred IS NOT NULL`);

// volatile predicate scan — no now()/current_* in any partial predicate
const { rows: volatile } = await client.query(`
  SELECT c.relname, i.relname AS idx, pg_get_expr(x.indpred, x.indrelid) AS pred
  FROM pg_index x
  JOIN pg_class c ON c.oid = x.indrelid
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND x.indpred IS NOT NULL
    AND (pg_get_expr(x.indpred, x.indrelid) ILIKE '%now(%'
         OR pg_get_expr(x.indpred, x.indrelid) ILIKE '%current_%')
`);
note(`volatile predicates: ${volatile.length}`);
if (volatile.length > 0) {
  fail(`volatile predicate found on: ${volatile.map((r) => `${r.relname}.${r.idx}`).join(', ')}`);
}

// duplicate definition scan (same table + same normalized definition)
const { rows: dup } = await client.query(`
  SELECT c.relname, pg_get_indexdef(i.oid, 0, false) AS def, count(*) AS n
  FROM pg_index x
  JOIN pg_class c ON c.oid = x.indrelid
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  GROUP BY c.relname, pg_get_indexdef(i.oid, 0, false)
  HAVING count(*) > 1
`);
note(`duplicate index definitions: ${dup.length}`);
if (dup.length > 0)
  fail(`duplicate index definition(s) on: ${dup.map((r) => r.relname).join(', ')}`);

// unowned index scan — every non-constraint-backed index must carry the
// approved `ix_` name prefix (constraint-backed ones carry pk_/uq_).
const { rows: unnamed } = await client.query(`
  SELECT i.relname FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_namespace n ON n.oid = i.relnamespace
  WHERE n.nspname = 'public' AND NOT x.indisprimary AND NOT x.indisunique
    AND i.relname NOT LIKE 'ix\\_%'
`);
if (unnamed.length > 0)
  fail(`unowned/non-conforming index name(s): ${unnamed.map((r) => r.relname).join(', ')}`);

await client.end();
process.exitCode = finish();
