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

export const OPENAPI_PATH = 'packages/contracts/openapi/openapi.generated.json';
export const GENERATED_CLIENT_DIR = 'packages/api-client/src/generated';
export const MIGRATIONS_DIR = 'packages/database/migrations';
export const FINGERPRINT_PATH = 'packages/database/tools/canonical-fingerprint.txt';

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
    ['Figma registry IDs', measured.figma?.registryIds, expected.figmaIds],
    ['Figma node rows', measured.figma?.nodeRows, expected.figmaNodeRows],
    ['Figma registry tables', measured.figma?.tables, expected.figmaTables],
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

  return measured;
}
