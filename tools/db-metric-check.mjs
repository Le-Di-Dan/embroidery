/**
 * Metric-reconciliation checks for the DB6 manifests (DB6-C1).
 *
 * Companion module to `db-manifest-check.mjs`, which owns structural manifest
 * integrity; this module owns the cardinality metrics introduced by
 * DEV-DB6-007 — REL row→edge expansion, the physical-index formula, and the
 * retired/rejected-index scan. Each check receives the shared reporting
 * context so all findings surface through one exit code.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const EXPECTED_REL_ROWS = 92;
const EXPECTED_FK_EDGES = 129;

/**
 * REL cardinality: re-derives the row→edge expansion from the DB4 source
 * document, so the manifest's claimed 92 rows / 129 edges cannot silently
 * drift from what DB4 actually defines (DEV-DB6-007).
 */
export function checkRelCardinality({ read, docs, fail, note }) {
  const relDoc = read(join(docs, 'DB4_RELATIONSHIP_AND_FK_MODEL.md'));
  const relRows = relDoc.split('\n').filter((l) => /^\| REL-\d{3} \|/.test(l));
  const seen = new Set();
  let edges = 0;
  const dist = {};
  for (const row of relRows) {
    const id = row.match(/REL-\d{3}/)[0];
    if (seen.has(id)) continue;
    seen.add(id);
    const m = row.match(/×(\d)/);
    const n = m ? Number(m[1]) : 1;
    edges += n;
    dist[n] = (dist[n] ?? 0) + 1;
  }
  if (seen.size !== EXPECTED_REL_ROWS) {
    fail(`DB4 defines ${seen.size} REL rows, manifest claims ${EXPECTED_REL_ROWS}`);
  }
  if (edges !== EXPECTED_FK_EDGES) {
    fail(`DB4 REL rows expand to ${edges} FK edges, manifest claims ${EXPECTED_FK_EDGES}`);
  }
  const distText = Object.entries(dist)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([n, c]) => `x${n}:${c}`)
    .join(' ');
  note(`REL: ${seen.size} rows -> ${edges} FK edges (${distText})`);
}

/**
 * Index physical-object formula (index manifest §2.5):
 *
 *   constraint-created (78 PK + 50 UNIQUE = 128)
 *   + explicit          (13 partial unique + 70 performance = 83)
 *   = total physical indexes at launch: 211
 *
 * Both the formula arithmetic and the metric-table rows must agree.
 */
export function checkIndexFormula({ indexManifest, fail, note }) {
  const block = indexManifest.match(
    /constraint-created \((\d+) PK \+ (\d+) UNIQUE = (\d+)\)[\s\S]*?\+ explicit\s+\((\d+) partial unique \+ (\d+) performance = (\d+)\)[\s\S]*?= total physical indexes at launch: (\d+)/,
  );
  if (block === null) {
    fail('index manifest §2.5 formula block is missing or malformed');
    return;
  }
  const [pk, uniqueBacking, constraintCreated, partialUnique, performance, explicit, total] = block
    .slice(1)
    .map(Number);
  if (pk + uniqueBacking !== constraintCreated) {
    fail(`formula: ${pk} PK + ${uniqueBacking} UNIQUE != ${constraintCreated}`);
  }
  if (partialUnique + performance !== explicit) {
    fail(`formula: ${partialUnique} pUQ + ${performance} perf != ${explicit}`);
  }
  if (constraintCreated + explicit !== total) {
    fail(
      `index formula does not balance: ${constraintCreated} constraint-created + ${explicit} explicit != ${total}`,
    );
  }
  const metric = (label) => {
    const row = indexManifest.split('\n').find((l) => l.startsWith('|') && l.includes(label));
    return Number(row?.match(/\|\s*(\d+)/)?.[1] ?? NaN);
  };
  if (metric('Constraint-created physical indexes') !== constraintCreated) {
    fail('metric table disagrees with formula on constraint-created count');
  }
  if (metric('Explicit physical indexes') !== explicit) {
    fail('metric table disagrees with formula on explicit count');
  }
  if (metric('Total physical indexes at launch') !== total) {
    fail('metric table disagrees with formula on total count');
  }
  note(
    `index formula: ${constraintCreated} constraint-created + ${explicit} explicit = ${total} physical at launch`,
  );
}

/**
 * Retired, conditional and rejected index IDs must never surface in schema
 * source files or migrations — implementing one is a governance breach, not a
 * style issue (DB5 §9).
 */
export function checkForbiddenIndexReferences({
  schemaDir,
  migrationsDir,
  retiredIdx,
  fail,
  note,
}) {
  const sources = [];
  if (existsSync(schemaDir)) {
    for (const context of readdirSync(schemaDir, { withFileTypes: true })) {
      if (!context.isDirectory()) continue;
      for (const file of readdirSync(join(schemaDir, context.name))) {
        sources.push(join(schemaDir, context.name, file));
      }
    }
  }
  if (existsSync(migrationsDir)) {
    for (const file of readdirSync(migrationsDir)) {
      if (file.endsWith('.sql')) sources.push(join(migrationsDir, file));
    }
  }
  const forbidden = [...retiredIdx, 'IDX-056', 'IDX-R'];
  for (const path of sources) {
    const text = readFileSync(path, 'utf8');
    for (const marker of forbidden) {
      if (text.includes(marker)) {
        fail(`${path} references ${marker}, which is retired, conditional, or rejected`);
      }
    }
  }
  note(`retired/conditional/rejected IDX scan: ${sources.length} source files clean`);
}

/**
 * Column-metric reconciliation (DB6-C2). Parses the machine-readable register
 * (`column-metrics.ts`) and the manifest §4.1 group table, then verifies:
 * per-row formula balance, register↔manifest group sums, global totals, and
 * that the register covers exactly the manifest's implemented tables. The
 * live-schema side (physical counts, export bijection, negative fixture) is
 * owned by `column-metrics.spec.ts`, which runs in the same quality gate.
 */
export function checkColumnMetrics({ read, packagesDir, schemaManifest, fail, note }) {
  const registerSource = read(join(packagesDir, 'database', 'src', 'schema', 'column-metrics.ts'));
  // Whitespace-tolerant: prettier may wrap register rows across lines.
  const rowRe =
    /table:\s*'([a-z_]+)',\s*group:\s*'(G\d+)',\s*logicalIds:\s*(\d+),\s*expansions:\s*(\d+),\s*convention:\s*(\d+),\s*physical:\s*(\d+)/g;
  const rows = [];
  for (const m of registerSource.matchAll(rowRe)) {
    rows.push({
      table: m[1],
      group: m[2],
      logicalIds: Number(m[3]),
      expansions: Number(m[4]),
      convention: Number(m[5]),
      physical: Number(m[6]),
    });
  }
  if (rows.length === 0) {
    fail('column-metric register has no parseable rows');
    return;
  }
  const seen = new Set();
  const groupSums = new Map();
  for (const row of rows) {
    if (seen.has(row.table)) fail(`column metrics: ${row.table} registered twice`);
    seen.add(row.table);
    const business = row.logicalIds + row.expansions;
    if (business + row.convention !== row.physical) {
      fail(
        `column metrics: ${row.table} formula does not balance (${row.logicalIds}+${row.expansions}+${row.convention} != ${row.physical})`,
      );
    }
    const g = groupSums.get(row.group) ?? {
      tables: 0,
      logicalIds: 0,
      expansions: 0,
      convention: 0,
      physical: 0,
    };
    g.tables += 1;
    g.logicalIds += row.logicalIds;
    g.expansions += row.expansions;
    g.convention += row.convention;
    g.physical += row.physical;
    groupSums.set(row.group, g);
  }

  // manifest §4.1 group rows: | G1 | 3 | 17 | 0 | 17 | 9 | 26 |
  const manifestRows = schemaManifest
    .split('\n')
    .filter((l) => /^\| (G\d+|Total) \| \d+ \| \d+ \| \d+ \| \d+ \| \d+ \| \d+ \|/.test(l));
  let manifestTotal = null;
  for (const line of manifestRows) {
    const c = line.split('|').map((s) => s.trim());
    const entry = {
      tables: Number(c[2]),
      logicalIds: Number(c[3]),
      expansions: Number(c[4]),
      business: Number(c[5]),
      convention: Number(c[6]),
      physical: Number(c[7]),
    };
    if (entry.logicalIds + entry.expansions !== entry.business) {
      fail(`manifest §4.1 ${c[1]}: ids+expansions != business`);
    }
    if (entry.business + entry.convention !== entry.physical) {
      fail(`manifest §4.1 ${c[1]}: business+convention != physical`);
    }
    if (c[1] === 'Total') {
      manifestTotal = entry;
      continue;
    }
    const g = groupSums.get(c[1]);
    if (g === undefined) {
      fail(`manifest §4.1 lists ${c[1]} but the register has no rows for it`);
      continue;
    }
    for (const key of ['tables', 'logicalIds', 'expansions', 'convention', 'physical']) {
      if (g[key] !== entry[key]) {
        fail(`manifest §4.1 ${c[1]} ${key}=${entry[key]} disagrees with register sum ${g[key]}`);
      }
    }
  }
  for (const group of groupSums.keys()) {
    if (!manifestRows.some((l) => l.includes(`| ${group} |`))) {
      fail(`register has ${group} rows but manifest §4.1 has no ${group} line`);
    }
  }
  const total = rows.reduce(
    (a, r) => ({ physical: a.physical + r.physical, tables: a.tables + 1 }),
    { physical: 0, tables: 0 },
  );
  if (manifestTotal === null) {
    fail('manifest §4.1 has no Total row');
  } else if (manifestTotal.physical !== total.physical || manifestTotal.tables !== total.tables) {
    fail(
      `manifest §4.1 Total (${manifestTotal.tables} tables, ${manifestTotal.physical} cols) disagrees with register (${total.tables}, ${total.physical})`,
    );
  }

  // the register must cover exactly the manifest's implemented tables
  const implemented = schemaManifest
    .split('\n')
    .filter((l) => /^\| TBL-\d{3} \|/.test(l) && l.trim().endsWith('implemented |'))
    .map((l) => l.match(/`([a-z_]+)`/)?.[1])
    .filter(Boolean);
  for (const table of implemented) {
    if (!seen.has(table)) fail(`implemented table ${table} missing from column-metric register`);
  }
  for (const table of seen) {
    if (!implemented.includes(table)) {
      fail(`register table ${table} is not marked implemented in the manifest`);
    }
  }
  note(
    `column metrics: ${total.tables} tables, ${total.physical} physical columns, register/manifest/formulas agree`,
  );
}
