/**
 * Deferred FK owner reconciliation (DEV-DB6-011). Companion module to
 * `db-metric-check.mjs`, split out at DB6-C3 to keep both files under the
 * 400-line source limit.
 *
 * A deferred edge names a resolution-owner group in
 * `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` §2.2.1; this re-derives each target
 * table's actual creation group from §3 and fails if the two disagree, if an
 * edge has zero or two owner rows, or if the G10/G15 table-count roll-up
 * drifts from the approved manifest. This is what would have caught the
 * `reservation_id → G10` error before it shipped in prose.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Column names with a closed, known-by-name deferred-FK history in DB6 (each
 * one traces to a specific G-group review in the deviation register). This
 * is deliberately a closed list, not a generic "nullable idReference with no
 * FK" scan — most nullable id-shaped columns in the schema are legitimate
 * no-FK evidence references (ledger actor refs, `submitted_session_id`, …)
 * and must NOT be forced into this ledger.
 */
const KNOWN_DEFERRED_COLUMNS = new Set([
  'soft_hold_id',
  'reservation_id',
  'order_id',
  'converted_reservation_id',
  'grant_id',
  'current_quotation_id',
  'current_version_id',
]);

/**
 * Scans implemented schema files for the closed set of known-deferred
 * columns and fails if one exists in a table's schema with no FK and no
 * matching row in the §2.2.1 ledger — the class of gap that let
 * `reservation_id` disappear from tracking entirely.
 */
function scanForUnledgedDeferredColumns({ schemaDir, migrationsDir, ledgerEdgeKeys, fail }) {
  if (!existsSync(schemaDir)) return 0;
  // A cycle-breaking pointer FK (DEV-DB6-008/010 pattern) may be added by a
  // forward custom-SQL migration rather than declared inline in the pgTable
  // definition — search migrations too before concluding "no FK yet".
  let migrationsText = '';
  if (migrationsDir && existsSync(migrationsDir)) {
    for (const file of readdirSync(migrationsDir)) {
      if (file.endsWith('.sql')) migrationsText += readFileSync(join(migrationsDir, file), 'utf8');
    }
  }
  let scanned = 0;
  for (const context of readdirSync(schemaDir, { withFileTypes: true })) {
    if (!context.isDirectory()) continue;
    for (const file of readdirSync(join(schemaDir, context.name))) {
      if (!file.endsWith('.ts')) continue;
      const path = join(schemaDir, context.name, file);
      const source = readFileSync(path, 'utf8');
      const tableName = source.match(/pgTable\(\s*'([a-z_]+)'/)?.[1];
      if (!tableName) continue;
      scanned += 1;
      for (const col of KNOWN_DEFERRED_COLUMNS) {
        if (!source.includes(`idReference('${col}')`)) continue;
        const fkName = `fk_${tableName}__${col}`;
        if (new RegExp(`\\b${fkName}\\b`).test(source)) continue;
        if (new RegExp(`\\b${fkName}\\b`).test(migrationsText)) continue;
        const key = `${tableName}.${col}`;
        if (!ledgerEdgeKeys.has(key)) {
          fail(
            `${key} is a known deferred-FK column with no FK yet, but has no row in the §2.2.1 ledger`,
          );
        }
      }
    }
  }
  return scanned;
}

export function checkDeferredOwnership({ schemaManifest, schemaDir, migrationsDir, fail, note }) {
  // table -> creation group, derived from the §3 group section headings.
  const tableGroup = new Map();
  let currentGroup = null;
  for (const line of schemaManifest.split('\n')) {
    const heading = line.match(/^### (G\d+) —/);
    if (heading) {
      currentGroup = heading[1];
      continue;
    }
    const row = line.match(/^\| TBL-\d{3} \| `([a-z_]+)` \|/);
    if (row && currentGroup) tableGroup.set(row[1], currentGroup);
  }
  if (tableGroup.size === 0) {
    fail('deferred-owner check: could not derive any table→group mapping from §3 headings');
    return;
  }

  // §2.2.1 ledger rows:
  // | edge | REL | `source` (G#) | `col` | `target` (G#) | **G#** | behavior | status |
  const block = schemaManifest.match(/### 2\.2\.1[\s\S]*?(?=\n### 2\.3)/);
  if (!block) {
    fail('schema manifest §2.2.1 deferred FK edge ledger is missing');
    return;
  }
  const ledgerRows = block[0]
    .split('\n')
    .filter((l) => /^\|.*\|.*\(G\d+\).*\(G\d+\).*\|/.test(l) && !l.includes('---'));

  const seenEdges = new Map();
  let checked = 0;
  for (const row of ledgerRows) {
    const cells = row.split('|').map((s) => s.trim());
    if (cells.length < 10) continue;
    const [, , , source, sourceColRaw, target, owner] = cells;
    const sourceCol = sourceColRaw.replaceAll('`', '');
    const sourceTable = source.match(/`([a-z_]+)`/)?.[1];
    const sourceGroup = source.match(/\((G\d+)\)/)?.[1];
    const targetTable = target.match(/`([a-z_]+)`/)?.[1];
    const targetGroup = target.match(/\((G\d+)\)/)?.[1];
    const ownerGroup = owner.match(/G\d+/)?.[0];
    if (!sourceTable || !targetTable || !ownerGroup || !sourceGroup || !targetGroup) {
      fail(`deferred-owner ledger row is malformed: ${row.trim()}`);
      continue;
    }
    checked += 1;
    const edgeKey = `${sourceTable}.${sourceCol}`;
    if (seenEdges.has(edgeKey)) {
      fail(`deferred edge ${edgeKey} has two ledger rows (two owners) — must have exactly one`);
    }
    seenEdges.set(edgeKey, ownerGroup);

    const actualTargetGroup = tableGroup.get(targetTable);
    if (actualTargetGroup === undefined) {
      fail(`deferred edge ${edgeKey}: target table ${targetTable} not found in any §3 group`);
      continue;
    }
    if (actualTargetGroup !== targetGroup) {
      fail(
        `deferred edge ${edgeKey}: ledger states target group ${targetGroup} but §3 creates ${targetTable} in ${actualTargetGroup}`,
      );
    }
    if (ownerGroup !== actualTargetGroup) {
      fail(
        `deferred edge ${edgeKey}: resolution owner ${ownerGroup} does not equal target table ${targetTable}'s creation group ${actualTargetGroup} (no exception documented)`,
      );
    }
    const actualSourceGroup = tableGroup.get(sourceTable);
    if (actualSourceGroup !== undefined && actualSourceGroup !== sourceGroup) {
      fail(
        `deferred edge ${edgeKey}: ledger states source group ${sourceGroup} but §3 creates ${sourceTable} in ${actualSourceGroup}`,
      );
    }
  }

  // group roll-up: G10 must be exactly 4 tables, G15 exactly 8.
  const rollup = schemaManifest.match(/### 3\.1[\s\S]*?(?=\n---|\n## )/)?.[0] ?? '';
  const rollupCount = (group) => {
    const row = rollup.split('\n').find((l) => l.startsWith(`| ${group} |`));
    return Number(row?.split('|')[2]?.trim());
  };
  if (rollupCount('G10') !== 4) {
    fail(`group roll-up: G10 has ${rollupCount('G10')} tables, expected exactly 4 (DEV-DB6-011)`);
  }
  if (rollupCount('G15') !== 8) {
    fail(`group roll-up: G15 has ${rollupCount('G15')} tables, expected exactly 8 (DEV-DB6-011)`);
  }

  const scanned = schemaDir
    ? scanForUnledgedDeferredColumns({
        schemaDir,
        migrationsDir,
        ledgerEdgeKeys: new Set(seenEdges.keys()),
        fail,
      })
    : 0;

  note(
    `deferred-owner ledger: ${checked} edges, all resolution owners match target creation group (${scanned} schema files scanned for unledged deferred columns)`,
  );
}
