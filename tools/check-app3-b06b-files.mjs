#!/usr/bin/env node
/**
 * `APP3-B06B` — the file map and the three readers every half shares.
 *
 * Separated so the parent gate and the contract gate resolve the same paths from
 * one table. Two copies of a path map is how one half ends up asserting against
 * a file the other half no longer reads.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESIGN = 'apps/api/src/modules/design';
const ASSET = 'apps/api/src/modules/asset';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  lane: `${ASSET}/domain/intake-lane.ts`,
  parser: `${ASSET}/infrastructure/http/multipart-upload.parser.ts`,
  reader: `${ASSET}/infrastructure/http/validated-file.reader.ts`,
  policy: `${DESIGN}/domain/session-asset-intake.policy.ts`,
  codec: `${DESIGN}/domain/session-upload-result.codec.ts`,
  transactions: `${DESIGN}/application/session-asset-transactions.service.ts`,
  intake: `${DESIGN}/application/session-asset-intake.service.ts`,
  projection: `${DESIGN}/application/session-asset-projection.ts`,
  controller: `${DESIGN}/presentation/public-design-session-asset.controller.ts`,
  request: `${DESIGN}/presentation/schemas/session-asset.request.ts`,
  response: `${DESIGN}/presentation/schemas/session-asset.response.ts`,
  module: `${DESIGN}/design.module.ts`,
  sessionRepository: `${DESIGN}/domain/repositories/design-session.repository.ts`,
  drizzleSession: `${DESIGN}/infrastructure/persistence/drizzle-design-session.repository.ts`,
  unitSpec: `${DESIGN}/session-asset-intake.spec.ts`,
  liveSpec: 'apps/api/test/integration/design-session-asset-intake.integration.spec.ts',
  liveHarness: 'apps/api/test/support/design-session-asset-context.ts',
  liveConfig: 'apps/api/jest.design-session-asset.config.mjs',
  defaultJestConfig: 'apps/api/jest.config.mjs',
  rootManifest: 'package.json',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
});

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with comments stripped, so prose can never satisfy an assertion. */
export function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function requireAll(rootDir, key, rules, fail) {
  const source = code(read(rootDir, key) ?? '');
  if (source === '') {
    fail(`${CANONICAL_FILES[key]}: missing`);
    return;
  }
  for (const [pattern, complaint] of rules) {
    if (!pattern.test(source)) fail(`${CANONICAL_FILES[key]}: ${complaint}`);
  }
}
