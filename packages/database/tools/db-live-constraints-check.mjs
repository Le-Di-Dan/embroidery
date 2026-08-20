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

// CHECK moved 189 -> 190 in APP2-DB01: `ck_asset_derivatives__watermark_by_kind`
// gives INV-22 its first physical half. The kind CHECK was replaced in place,
// so it is one added constraint, not a renumbered inventory.
// APP5-DB01 adds two more CHECKs (CST-127 `ck_assets__single_intake_lane`,
// CST-128 `ck_assets__challenge_intake_requires_expiry`) and one FK (REL-106).
// APP6-DB01 adds three CHECKs (CST-129/CST-131 exactly-one placement branch on
// `design_versions`/`approval_snapshots`, CST-130 the COP placement labels) and
// two FKs (REL-107/REL-108, both -> `customer_owned_products`).
const EXPECTED = { p: 78, f: 165, u: 52, c: 204 };
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
// The DB6 ceiling is 160 (DEV-DB6-017). APP3-DB01 adds exactly two application-era
// edges — the `superseded_by_id` self-references on `product_sides` and
// `embroidery_areas` — so the live total is 162. Kept as an explicit sum rather
// than a new round number: the point of the check is that no *undocumented* edge
// appears, and collapsing it to one literal would hide which are accounted for.
// APP5-DB01 adds one more — REL-106, `fk_assets__uploaded_via_challenge_id` —
// so the live total is 163, and it stays its own named addend for that reason.
// The APP6-DB01 pair (REL-107/REL-108) is the customer-owned-product branch
// ADR-APP6-001 opened on `design_versions` and `approval_snapshots`.
const DB6_RELATIONSHIP_CEILING = 160;
const APP3_DB01_EDGES = 2;
const APP5_DB01_EDGES = 1;
const APP6_DB01_EDGES = 2;
const EXPECTED_FKS = DB6_RELATIONSHIP_CEILING + APP3_DB01_EDGES + APP5_DB01_EDGES + APP6_DB01_EDGES;
note(
  `relationship ceiling: ${relationshipCeiling[0].n} / ${EXPECTED_FKS} ` +
    `(${DB6_RELATIONSHIP_CEILING} DEV-DB6-017 + ${APP3_DB01_EDGES} APP3-DB01` +
    ` + ${APP5_DB01_EDGES} APP5-DB01 + ${APP6_DB01_EDGES} APP6-DB01)`,
);
if (relationshipCeiling[0].n !== EXPECTED_FKS) {
  fail(
    `relationship ceiling moved — live FK count is ${relationshipCeiling[0].n}, expected ${EXPECTED_FKS}`,
  );
}

await client.end();
process.exitCode = finish();
