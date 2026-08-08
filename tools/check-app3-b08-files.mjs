#!/usr/bin/env node
/**
 * `APP3-B08` — the file map and the readers both halves share.
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

export const ROUTE = '/api/public/design-sessions/{sessionId}/document';
export const OPERATION = 'publicDesignSession_autosave';
export const HTTP_METHODS = Object.freeze(['get', 'post', 'put', 'patch', 'delete']);

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  useCase: `${DESIGN}/application/autosave-design-session.use-case.ts`,
  documents: `${DESIGN}/application/design-document.authority.ts`,
  placement: `${DESIGN}/application/session-placement.authority.ts`,
  mediaAuthority: `${DESIGN}/application/session-document-media.authority.ts`,
  request: `${DESIGN}/presentation/schemas/design-session-autosave.request.ts`,
  controller: `${DESIGN}/presentation/public-design-session.controller.ts`,
  authorization: `${DESIGN}/domain/design-session-authorization.ts`,
  sessionRepository: `${DESIGN}/domain/repositories/design-session.repository.ts`,
  module: `${DESIGN}/design.module.ts`,
  assetRepository: `${ASSET}/domain/repositories/asset.repository.ts`,
  unitSpec: `${DESIGN}/design-session-autosave.spec.ts`,
  liveSpec: 'apps/api/test/integration/design-session-autosave.integration.spec.ts',
  liveHarness: 'apps/api/test/support/design-session-autosave-context.ts',
  authConfig: `${DESIGN}/config/design-session-auth.config.ts`,
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
