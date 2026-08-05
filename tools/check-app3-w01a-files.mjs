#!/usr/bin/env node
/**
 * The `APP3-W01A` canonical file map and the two readers every checker uses.
 *
 * Extracted so `check-app3-w01a.mjs` and `check-app3-w01a-output.mjs` can each
 * own a responsibility without either importing the other — a cycle whose only
 * symptom would be an undefined constant at call time, in a tool whose job is
 * to be trusted.
 *
 * Read-only, cross-platform pure Node. Not a checker: it has no `main`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The normalization job tree, walked whole by the no-SVG-branch scan. */
export const JOB_DIR = 'apps/worker/src/jobs/asset-normalization';

export const CANONICAL_FILES = Object.freeze({
  payload: `${JOB_DIR}/domain/asset-normalization.payload.ts`,
  sharedContract: 'packages/domain-types/src/events/asset-normalization-requested.ts',
  policy: `${JOB_DIR}/domain/normalization-policy.ts`,
  outcome: `${JOB_DIR}/domain/normalization-outcome.ts`,
  port: `${JOB_DIR}/domain/repositories/asset-normalization.repository.ts`,
  association: `${JOB_DIR}/application/association-resolution.service.ts`,
  derivative: `${JOB_DIR}/application/normalized-derivative.service.ts`,
  writer: `${JOB_DIR}/application/derivative-object-writer.ts`,
  usecase: `${JOB_DIR}/application/asset-normalization.usecase.ts`,
  repository: `${JOB_DIR}/infrastructure/persistence/sql-asset-normalization.repository.ts`,
  handler: `${JOB_DIR}/asset-normalization.handler.ts`,
  module: `${JOB_DIR}/asset-normalization.module.ts`,
  workerModule: 'apps/worker/src/bootstrap/worker.module.ts',
  inspectionPayload: 'apps/worker/src/jobs/asset-inspection/domain/asset-inspection.payload.ts',
  derivativeSchema: 'packages/database/src/schema/asset/asset-derivatives.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  rootManifest: 'package.json',
  workerManifest: 'apps/worker/package.json',
});

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with comments removed, so prose explaining a rule cannot trip a scan. */
export function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * True only in the second consistent world: `APP3-W01B` recorded as delivered
 * **and** `IMP-D047` still locked. Both tokens, so a status line alone cannot
 * relax a rule these gates exist to hold.
 */
export function isW01bDelivered(rootDir) {
  const phase = read(rootDir, 'phase') ?? '';
  return /APP3-W01B\s*=\s*COMPLETE/.test(phase) && /IMP-D047\s*=\s*LOCKED/.test(phase);
}

/**
 * True once `APP3-B02` has delivered its one public operation.
 *
 * The published surface is frozen per world rather than absolutely: `APP3-W01A`
 * adds no HTTP operation in either, and that is the property being asserted —
 * the total is only the way to measure it.
 */
export function isB02Delivered(rootDir) {
  return /APP3-B02\s*=\s*COMPLETE/.test(read(rootDir, 'phase') ?? '');
}
