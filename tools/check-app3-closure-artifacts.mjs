#!/usr/bin/env node
/**
 * The evidence half of the `APP3-X01` closure check: the frozen artifacts.
 *
 * A sibling of `check-app3-closure.mjs` — the split is by responsibility, not
 * line count. That file asks whether the phase's *record* is consistent; this
 * one asks whether the numbers in it still describe the repository.
 *
 * The measurement itself is deliberately not repeated here. It comes from
 * `measureFrozenArtifacts`, the canonical implementation APP2's closure already
 * used, because a second copy of the arithmetic could drift and would then
 * attest to its own drift.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CANONICAL_FILES, EXPECTED } from './check-app3-closure.sources.mjs';

const read = (root, key) => {
  const path = join(root, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
};

/**
 * Frozen artifacts, measured elsewhere, against both the baseline and the
 * matrix that claims them.
 *
 * Two failures, not one: an artifact that moved is drift, and a matrix that
 * stopped writing the number down is a record a reader cannot audit. A closure
 * can fail either way, and they are not the same problem.
 */
export function checkArtifacts(root, measured, fail) {
  const matrix = read(root, 'matrix') ?? '';
  const scripts = JSON.parse(read(root, 'rootPackage') ?? '{"scripts":{}}').scripts ?? {};

  const claims = [
    ['OpenAPI paths', measured.openapi?.paths, EXPECTED.openapiPaths],
    ['OpenAPI operations', measured.openapi?.operations, EXPECTED.openapiOperations],
    ['OpenAPI schemas', measured.openapi?.schemas, EXPECTED.openapiSchemas],
    ['OpenAPI hash', measured.openapi?.hash, EXPECTED.openapiHash],
    ['generated client hash', measured.client, EXPECTED.clientHash],
    ['migration count', measured.migrations, EXPECTED.migrations],
    ['database fingerprint', measured.fingerprint, EXPECTED.fingerprint],
    ['root script count', Object.keys(scripts).length, EXPECTED.rootScripts],
  ];
  for (const [label, actual, expected] of claims) {
    if (actual !== expected) {
      fail(`frozen ${label} drifted: expected ${String(expected)}, measured ${String(actual)}`);
    }
    if (!matrix.includes(String(expected))) {
      fail(`the closure matrix does not record the frozen ${label} (${String(expected)})`);
    }
  }

  // Live-database facts, measured by `APP3-DB01` and the manifest gate rather
  // than readable from one file here. The matrix must still carry them.
  for (const [label, value] of [
    ['table count', EXPECTED.tables],
    ['column count', EXPECTED.columns],
  ]) {
    if (!matrix.includes(String(value))) {
      fail(`the closure matrix does not record the frozen ${label} (${String(value)})`);
    }
  }
}
