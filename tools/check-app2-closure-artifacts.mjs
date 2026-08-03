#!/usr/bin/env node
/**
 * The evidence half of the `APP2-X01` closure check: frozen artifacts, the
 * APP2-owned Figma subset, and next-phase chronology. A sibling of
 * `check-app2-closure.mjs` — the split is by responsibility, not line count.
 *
 * Everything is read from the repository or the commit graph rather than from
 * prose, and every measurement reuses the canonical implementation
 * (`hashGeneratedTree`, `checkFigmaDesignIndex`) instead of a second copy that
 * could drift and then attest to its own arithmetic.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { hashGeneratedTree } from '../packages/api-client/scripts/generated-tree.mjs';
import { checkFigmaDesignIndex } from './check-figma-design-index.mjs';
import { cell, parseTables } from './check-figma-design-index.parse.mjs';

export const OPENAPI_PATH = 'packages/contracts/openapi/openapi.generated.json';
export const GENERATED_CLIENT_DIR = 'packages/api-client/src/generated';
export const MIGRATIONS_DIR = 'packages/database/migrations';
export const FINGERPRINT_PATH = 'packages/database/tools/canonical-fingerprint.txt';
export const FIGMA_INDEX_PATH = 'docs/design/FIGMA_DESIGN_INDEX.md';
export const FIGMA_BASELINE_PATH = 'docs/implementation/reports/APP2-CLOSURE-FIGMA-BASELINE.json';
export const REPORTS_DIR = 'docs/implementation/reports';

/** A next-phase (APP3) report, by filename. */
export const NEXT_PHASE_REPORT_RE = /^APP3-.*\.md$/;

/** HTTP methods that count as an operation for the frozen OpenAPI shape. */
const OPERATION_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

/** Paths, operations and schemas of an OpenAPI document. */
export function countOpenapi(document) {
  let operations = 0;
  for (const path of Object.values(document.paths ?? {})) {
    operations += Object.keys(path).filter((key) => OPERATION_METHODS.has(key)).length;
  }
  return {
    paths: Object.keys(document.paths ?? {}).length,
    operations,
    schemas: Object.keys(document.components?.schemas ?? {}).length,
  };
}

/**
 * Every frozen artifact, measured from the repository. A missing one comes back
 * `undefined` rather than throwing: a deleted OpenAPI document is a closure
 * failure to describe, not a crash to debug.
 */
export async function measureFrozenArtifacts(root) {
  const measured = {
    openapi: undefined,
    client: undefined,
    migrations: 0,
    fingerprint: undefined,
    figma: undefined,
  };

  const openapiAbs = join(root, OPENAPI_PATH);
  if (existsSync(openapiAbs)) {
    const raw = readFileSync(openapiAbs);
    measured.openapi = {
      hash: createHash('sha256').update(raw).digest('hex'),
      ...countOpenapi(JSON.parse(raw.toString('utf8'))),
    };
  }

  const generatedDir = join(root, GENERATED_CLIENT_DIR);
  if (existsSync(generatedDir)) {
    measured.client = (await hashGeneratedTree(generatedDir)).hash;
  }

  const migrationsDir = join(root, MIGRATIONS_DIR);
  if (existsSync(migrationsDir)) {
    measured.migrations = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).length;
  }

  const fingerprintAbs = join(root, FINGERPRINT_PATH);
  if (existsSync(fingerprintAbs)) {
    measured.fingerprint = readFileSync(fingerprintAbs, 'utf8').trim();
  }

  measured.figma = checkFigmaDesignIndex(root).stats;
  return measured;
}

/**
 * Measured artifacts versus the frozen baseline, plus the matrix actually
 * writing each value down. A matrix recording right numbers while the artifacts
 * moved is stale; one omitting them cannot be audited by a reader.
 */
export async function checkFrozenArtifacts(root, matrixText, expected, fail) {
  const measured = await measureFrozenArtifacts(root);

  const claims = [
    ['OpenAPI hash', measured.openapi?.hash, expected.openapiHash],
    ['OpenAPI paths', measured.openapi?.paths, expected.openapiPaths],
    ['OpenAPI operations', measured.openapi?.operations, expected.openapiOperations],
    ['OpenAPI schemas', measured.openapi?.schemas, expected.openapiSchemas],
    ['generated client hash', measured.client, expected.clientHash],
    ['migration count', measured.migrations, expected.migrations],
    ['database fingerprint', measured.fingerprint, expected.fingerprint],
  ];

  for (const [label, actual, value] of claims) {
    if (actual !== value) {
      fail(`frozen ${label} drifted: expected ${String(value)}, measured ${String(actual)}`);
    }
    if (!matrixText.includes(String(value))) {
      fail(`closure matrix does not record the frozen ${label} (${String(value)})`);
    }
  }

  // Live-database facts: measured by `APP2-E01` against the migrated disposable
  // database, not readable from a file here. The matrix must still carry them.
  for (const [label, value] of [
    ['table count', expected.tables],
    ['column count', expected.columns],
    ['CHECK count', expected.checks],
  ]) {
    if (!matrixText.includes(String(value))) {
      fail(`closure matrix does not record the frozen ${label} (${String(value)})`);
    }
  }

  checkOwnedFigmaBaseline(root, fail);
  return measured;
}

/**
 * The nearest heading above a registry table. Section is part of a frozen row
 * identity: moving an owned row elsewhere changes what the closure attested.
 */
function sectionFor(lines, headerLineNo) {
  for (let i = headerLineNo - 2; i >= 0; i -= 1) {
    const match = /^(#{2,6})\s+(.*)$/.exec(lines[i] ?? '');
    if (match) return match[2].trim();
  }
  return '(document root)';
}

/** ASCII unit separator: cannot appear inside a markdown table cell. */
const FIELD_SEPARATOR = String.fromCharCode(31);

/** First 16 hex of sha256 over the row's frozen identity. */
function rowDigest(id, section, fields) {
  return createHash('sha256')
    .update([id, section, ...fields].join(FIELD_SEPARATOR))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Every node-registry row, keyed by registry ID. `duplicates` is tracked apart
 * so a later row cannot overwrite an earlier one and hide a duplicated ID.
 */
export function parseFigmaRegistryRows(markdown, authorityFields) {
  const lines = markdown.split('\n');
  const tables = parseTables(lines).filter(
    (t) => t.colIndex['Registry ID'] !== undefined && t.colIndex['Direct URL'] !== undefined,
  );

  const rows = new Map();
  const duplicates = new Set();
  const sections = [];

  for (const table of tables) {
    const section = sectionFor(lines, table.headerLineNo);
    if (!sections.includes(section)) sections.push(section);
    for (const row of table.rows) {
      const id = cell(row, table.colIndex, 'Registry ID').replace(/`/g, '');
      if (!id) continue;
      if (rows.has(id)) duplicates.add(id);
      const fields = authorityFields.map((name) =>
        cell(row, table.colIndex, name).replace(/`/g, ''),
      );
      rows.set(id, { section, digest: rowDigest(id, section, fields), fields });
    }
  }

  return { rows, duplicates, sections, tableCount: tables.length };
}

/**
 * Verifies the APP2-*owned* Figma subset, never the global totals
 * (`APP2-X01-C1`). A total made any unrelated addition a closure failure while
 * still missing an owned row deleted and replaced at the same count. The
 * baseline is the exact record set APP2 closed over (`FIGMA_BASELINE_PATH`):
 * each must stay present, unique, in its section and unchanged across the
 * authority fields. Everything else in the registry is free to grow.
 */
export function checkOwnedFigmaBaseline(root, fail) {
  const baselineAbs = join(root, FIGMA_BASELINE_PATH);
  if (!existsSync(baselineAbs)) {
    fail(`${FIGMA_BASELINE_PATH}: frozen APP2 Figma baseline is missing`);
    return;
  }
  const baseline = JSON.parse(readFileSync(baselineAbs, 'utf8'));

  const indexAbs = join(root, FIGMA_INDEX_PATH);
  if (!existsSync(indexAbs)) {
    fail(`${FIGMA_INDEX_PATH}: canonical Figma registry is missing`);
    return;
  }

  // A closure cannot attest over a broken registry. Dropping the global totals
  // removed the only thing that used to notice structural corruption, so the
  // registry gate itself is the replacement — reused, never re-implemented.
  const violations = checkFigmaDesignIndex(root).violations;
  if (violations.length > 0) {
    fail(
      `Figma registry is internally inconsistent (${String(violations.length)} violation(s); ` +
        `first: ${violations[0].rule} line ${String(violations[0].line)} — ${violations[0].message})`,
    );
  }

  const current = parseFigmaRegistryRows(
    readFileSync(indexAbs, 'utf8'),
    baseline.authorityFields ?? [],
  );

  const ownedIds = Object.keys(baseline.ownedRows ?? {});
  if (ownedIds.length !== baseline.ownedRowCount) {
    fail(
      `${FIGMA_BASELINE_PATH}: declares ${String(baseline.ownedRowCount)} owned rows but lists ${String(ownedIds.length)}`,
    );
  }

  for (const section of baseline.ownedSections ?? []) {
    if (!current.sections.includes(section)) {
      fail(`APP2-owned Figma section disappeared: "${section}"`);
    }
  }

  for (const id of ownedIds) {
    const [sectionIndex, digest] = String(baseline.ownedRows[id]).split(':');
    const expectedSection = (baseline.ownedSections ?? [])[Number(sectionIndex)];
    const row = current.rows.get(id);

    if (row === undefined) {
      fail(`APP2-owned Figma record removed: ${id}`);
      continue;
    }
    if (current.duplicates.has(id)) {
      fail(`APP2-owned Figma record duplicated: ${id}`);
      continue;
    }
    if (row.section !== expectedSection) {
      fail(
        `APP2-owned Figma record moved section: ${id} ("${expectedSection}" → "${row.section}")`,
      );
      continue;
    }
    if (row.digest !== digest) {
      fail(
        `APP2-owned Figma record changed an authority field: ${id} ` +
          `(frozen ${digest}, measured ${row.digest}; fields ${(baseline.authorityFields ?? []).join('/')} = ${row.fields.join(' | ')})`,
      );
    }
  }
}

/** One git call that never throws: here an exit code is an answer, not a crash. */
function git(repoRoot, args) {
  const run = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 33554432 });
  const why = run.error ? String(run.error.message) : (run.stderr ?? '').trim();
  return { ok: !run.error, status: run.error ? null : run.status, out: run.stdout ?? '', why };
}

/** Is `ancestor` reachable from `descendant`? `resolved:false` = git could not say. */
function isAncestor(repoRoot, ancestor, descendant) {
  const run = git(repoRoot, ['merge-base', '--is-ancestor', ancestor, descendant]);
  const usable = run.ok && (run.status === 0 || run.status === 1);
  const why = run.why || `git exited ${String(run.status)}`;
  return { resolved: usable, value: usable && run.status === 0, why };
}

/** Non-empty trimmed lines of git output. */
function lines(out) {
  return out.split('\n').flatMap((line) => (line.trim() ? [line.trim()] : []));
}

/** Current APP3 report basenames on disk, lexicographically sorted. */
function nextPhaseReportsOnDisk(repoRoot) {
  const dir = join(repoRoot, REPORTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && NEXT_PHASE_REPORT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * The next phase must not have *predated* the closure it depends on.
 *
 * What this replaces banned every `reports/APP3-*.md` outright, then carved out
 * one exact filename. That was never the invariant — APP2 is closed, so an APP3
 * report written *after* the closure commit is ordinary, correct work. The
 * prefix ban blocked two mandated post-closure governance reports, and an
 * exact-filename allowlist does not scale; the second one had to be worked
 * around by renaming a file.
 *
 * The invariant is chronological, so it is answered from the commit graph — not
 * from filenames, counts, report prose, or commit timestamps, which are
 * rebase-controlled while ancestry is what "after" actually means in Git:
 *
 *   A. `HEAD` must descend from the accepted APP2 closure commit;
 *   B. the closure commit's own tree must carry no APP3 report;
 *   C. every APP3 report on disk must have been *first added* after closure —
 *      or not be committed yet, which A already places after closure.
 */
export function checkNextPhaseChronology({ repoRoot, closureCommit }) {
  const violations = [];
  const tracked = [];
  const pending = [];
  const trackedPostClosureReports = tracked;
  const pendingPostClosureReports = pending;
  const evidence = {
    closureCommit,
    trackedPostClosureReports,
    pendingPostClosureReports,
    violations,
  };

  // Step A — HEAD descends from the accepted closure.
  const descends = isAncestor(repoRoot, closureCommit, 'HEAD');
  if (!descends.resolved) {
    violations.push(
      `chronology unresolved: cannot order HEAD against ${closureCommit} (${descends.why})`,
    );
    return evidence;
  }
  if (!descends.value) {
    violations.push(`HEAD does not descend from the accepted APP2 closure commit ${closureCommit}`);
    return evidence;
  }

  // Step B — the closure snapshot itself carried no APP3 report.
  const tree = git(repoRoot, ['ls-tree', '-r', '--name-only', closureCommit, '--', REPORTS_DIR]);
  if (!tree.ok || tree.status !== 0) {
    violations.push(
      `chronology unresolved: cannot read ${REPORTS_DIR} at ${closureCommit} (${tree.why})`,
    );
    return evidence;
  }
  for (const path of lines(tree.out).sort()) {
    if (NEXT_PHASE_REPORT_RE.test(path.slice(path.lastIndexOf('/') + 1))) {
      violations.push(
        `${path}: present in the APP2 closure commit ${closureCommit}, so it predates closure`,
      );
    }
  }

  // Step C — every APP3 report on disk was first added after closure.
  const ADD = ['log', '--follow', '--diff-filter=A', '--format=%H', '--reverse', '--'];
  for (const name of nextPhaseReportsOnDisk(repoRoot)) {
    const path = `${REPORTS_DIR}/${name}`;
    const log = git(repoRoot, [...ADD, path]);
    if (!log.ok || log.status !== 0) {
      violations.push(
        `${path}: chronology unresolved — cannot read its first-add commit (${log.why})`,
      );
      continue;
    }
    const firstAdd = lines(log.out)[0];
    if (firstAdd === undefined) {
      // Staged or untracked: no commit yet, and Step A already placed the commit
      // it will land on after closure.
      pending.push(path);
      continue;
    }
    if (firstAdd === closureCommit) {
      violations.push(`${path}: first added by the APP2 closure commit ${closureCommit} itself`);
      continue;
    }
    const after = isAncestor(repoRoot, closureCommit, firstAdd);
    if (!after.resolved) {
      violations.push(
        `${path}: chronology unresolved — cannot order first-add ${firstAdd} (${after.why})`,
      );
      continue;
    }
    if (!after.value) {
      violations.push(
        `${path}: first added by ${firstAdd}, which predates closure ${closureCommit}`,
      );
      continue;
    }
    tracked.push(path);
  }

  tracked.sort();
  pending.sort();
  return evidence;
}
