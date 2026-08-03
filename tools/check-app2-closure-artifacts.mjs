#!/usr/bin/env node
/**
 * The frozen-artifact half of the `APP2-X01` closure check.
 *
 * A sibling of `check-app2-closure.mjs`; the split is by responsibility, not by
 * line count. This file owns exactly one question — *do the artifacts still hash
 * and count to what the phase froze?* — and it answers it by reading the
 * artifacts themselves. A hash copied into prose stops matching the moment
 * somebody regenerates the thing it describes, and prose has no way to notice.
 *
 * Every measurement reuses the canonical implementation rather than a second
 * copy of it: `hashGeneratedTree` is the same function `pnpm check:api-client`
 * uses, and `checkFigmaDesignIndex` is the registry gate itself. A private
 * re-implementation could drift from the real gate and would then be attesting
 * to its own arithmetic.
 */
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
 * Every frozen artifact, measured from the repository.
 *
 * Missing artifacts come back `undefined` rather than throwing, so the caller
 * reports "drifted: measured undefined" — a deleted OpenAPI document is a
 * closure failure to describe, not a crash to debug.
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
 * Compares the measured artifacts with the frozen baseline, and checks that the
 * closure matrix actually writes each value down.
 *
 * Both halves matter. A matrix that records the right numbers while the
 * artifacts moved is stale; a matrix that omits them cannot be audited by
 * anyone reading it.
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
 * The section heading a registry table sits under — the nearest `##`..`######`
 * above it. Section is part of a row's frozen identity because moving an
 * APP2-owned row into an unrelated section changes what the closure attested,
 * even when every other field survives.
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
 * Every node-registry row in a registry markdown, keyed by registry ID.
 *
 * `duplicates` is tracked separately rather than letting a later row overwrite
 * an earlier one: a duplicated APP2-owned ID is precisely the shape of attack
 * an overwrite would hide.
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
 * Verifies the APP2-owned Figma subset rather than the registry's global totals.
 *
 * Freezing `86 registry IDs / 86 node rows / 11 tables` was structurally wrong:
 * the registry is one shared, appendable document that every later phase writes
 * into, so a global total makes *any* unrelated valid addition a closure
 * failure — while still failing to notice the thing that actually matters, an
 * APP2 row being deleted and replaced by an unrelated one at the same total.
 *
 * The baseline is instead the exact set of records APP2 closure owned,
 * transcribed from its own commit (`FIGMA_BASELINE_PATH`). Each must still be
 * present, unique, in its original section and unchanged across the authority
 * fields the closure attested. Anything else in the registry is free to grow.
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
