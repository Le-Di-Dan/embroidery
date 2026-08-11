#!/usr/bin/env node
/**
 * `APP3-B06C` — the one contextual private Design Session asset delivery.
 *
 * The rules worth a machine are the ones that stay green while being wrong. A
 * delivery route that authorizes on the Asset id alone. One that trusts the raw
 * path `sessionId` instead of the id the credential proved. One that accepts any
 * association, so another customer's photograph is one guessed id away. One that
 * serves an Asset inspection has not cleared, or has rejected. One that streams
 * the private `ORIGINAL` because the derivative is missing. One that reaches
 * object storage before it has decided anything, turning provider latency into an
 * existence oracle. One that sends a cacheable response, so an expired Session
 * cannot revoke it. One that charges a read against the mutation budget, or
 * advances the revision, or rotates the cookie. Every one of those ships a
 * working system.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { acceptedSurface, isB06CDelivered } from './app3-accepted-surface.mjs';
import {
  checkAuthorization,
  checkEligibility,
  checkOperationIdStability,
  checkReadSemantics,
} from './check-app3-b06c-security.mjs';
import { checkHeaders, checkReadOnly, checkStreaming } from './check-app3-b06c-stream.mjs';

export { checkAuthorization, checkEligibility, checkOperationIdStability, checkReadSemantics };
export { checkHeaders, checkReadOnly, checkStreaming };

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESIGN = 'apps/api/src/modules/design';

/** The one operation this checkpoint publishes, and its address. */
export const ROUTE = '/api/public/design-sessions/{sessionId}/assets/{assetId}/editor-preview';
export const OPERATION_ID = 'publicDesignSessionAsset_get';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  rootPackage: 'package.json',
  port: `${DESIGN}/domain/repositories/design-session-asset-delivery.repository.ts`,
  adapter: `${DESIGN}/infrastructure/persistence/drizzle-design-session-asset-delivery.repository.ts`,
  service: `${DESIGN}/application/design-session-asset-delivery.service.ts`,
  policy: `${DESIGN}/domain/design-session-asset-delivery.policy.ts`,
  errors: `${DESIGN}/domain/design-session-asset-delivery.errors.ts`,
  request: `${DESIGN}/presentation/schemas/design-session-asset-delivery.request.ts`,
  guard: `${DESIGN}/presentation/guards/design-session-read.guard.ts`,
  mutationGuard: `${DESIGN}/presentation/guards/design-session.guard.ts`,
  controller: `${DESIGN}/presentation/public-design-session-asset-preview.controller.ts`,
  uploadController: `${DESIGN}/presentation/public-design-session-asset.controller.ts`,
  module: `${DESIGN}/design.module.ts`,
  originPolicy: `${DESIGN}/infrastructure/http/design-session-origin.policy.ts`,
  operationId: 'apps/api/src/openapi/operation-id.ts',
  unitSpec: `${DESIGN}/design-session-asset-delivery.spec.ts`,
  contractSpec: `${DESIGN}/presentation/design-session-asset-delivery.contract.spec.ts`,
  liveSpec: 'apps/api/test/integration/design-session-asset-delivery.integration.spec.ts',
  liveContext: 'apps/api/test/support/design-session-asset-context.ts',
});

/** Every source file this checkpoint owns, for the whole-file bans below. */
export const OWNED_SOURCE = Object.freeze([
  'port',
  'adapter',
  'service',
  'policy',
  'errors',
  'request',
  'guard',
  'controller',
]);

const MIGRATIONS = 'packages/database/migrations';
const EXPECTED_MIGRATIONS = 34;
const ROOT_SCRIPTS = 30;

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with its prose removed, so a ban never fires on the rule explaining it. */
export function code(rootDir, key) {
  return (read(rootDir, key) ?? '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/(^|[^:])\/\/.*$/gm, '$1');
}

export function openapi(rootDir) {
  const raw = read(rootDir, 'openapi');
  return raw === undefined ? undefined : JSON.parse(raw);
}

/** The predecessors this delivery route is only meaningful on top of. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    // The `APP3-S05` chain, which human review accepted before this checkpoint
    // was allowed to start.
    'APP3-S05 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-S05-C1 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-S05-MI01 = COMPLETE — REVIEW_ACCEPTED',
    // The semantic authorities this route reuses and never redesigns.
    'APP3-B06A = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B06B = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B07 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-W01A = COMPLETE — REVIEW_ACCEPTED',
    'APP3-W01C = COMPLETE — REVIEW_ACCEPTED',
    'APP3-DB01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G04 = COMPLETE — REVIEW_ACCEPTED',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
  if (!isB06CDelivered(rootDir)) {
    fail(`${CANONICAL_FILES.phase}: APP3-B06C is not recorded complete`);
  }
  for (const line of [
    `APP3-B06C OPERATIONS = ${OPERATION_ID}`,
    'APP3-B06C WRITES = NONE',
    'APP3-B06C AUDIT = NONE',
    'APP3-B06C EVENTS = NONE',
    'APP3-B06C MIGRATION = NONE',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
  // `APP3-S06` is the consumer, not part of this checkpoint. A phase document
  // claiming it has shipped would be B06C implementing its own consumer.
  if (/\nAPP3-S06 = COMPLETE/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: APP3-S06 is recorded complete; B06C does not implement it`);
  }
}

/** Exactly one new operation, at exactly the locked address. */
export function checkOperation(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) {
    fail(`${CANONICAL_FILES.openapi}: the generated OpenAPI artifact is missing`);
    return;
  }

  const item = document.paths?.[ROUTE];
  if (item === undefined) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} is not published`);
    return;
  }

  const methods = Object.keys(item).filter((key) =>
    ['get', 'put', 'post', 'patch', 'delete'].includes(key),
  );
  if (methods.length !== 1 || methods[0] !== 'get') {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} declares ${methods.join(', ')}; expected only get`);
  }

  const get = item.get ?? {};
  if (get.operationId !== OPERATION_ID) {
    fail(
      `${CANONICAL_FILES.openapi}: ${ROUTE} publishes "${String(get.operationId)}"; ` +
        `expected "${OPERATION_ID}"`,
    );
  }
  if (get.requestBody !== undefined) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} declares a request body`);
  }

  const parameters = (get.parameters ?? []).filter((parameter) => parameter.in !== 'header');
  const names = parameters.map((parameter) => `${parameter.in}:${parameter.name}`).sort();
  if (names.join(',') !== 'path:assetId,path:sessionId') {
    // A query parameter here is the one that eventually chooses the original.
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} takes ${names.join(', ')}`);
  }
  for (const parameter of parameters) {
    if (parameter.schema?.format !== 'uuid') {
      fail(`${CANONICAL_FILES.openapi}: ${ROUTE} does not declare "${parameter.name}" as a uuid`);
    }
  }

  const success = Object.keys(get.responses?.['200']?.content ?? {});
  if (success.includes('application/json') || success.length === 0) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} does not answer with a binary body`);
  }

  checkExactlyOneNewOperation(rootDir, document, fail);

  const client = read(rootDir, 'client') ?? '';
  if (!client.includes('publicDesignSessionAssetGet')) {
    fail(`${CANONICAL_FILES.client}: the generated client does not carry the operation`);
  }
  if (!/responseType: 'blob'/.test(client)) {
    fail(`${CANONICAL_FILES.client}: the generated client does not read the response as a blob`);
  }
}

/**
 * The surface grew by exactly this one operation, and by no second Session-asset
 * address.
 *
 * The counts come from the accepted-surface authority rather than from literals
 * here: a gate carrying its own copy of history is a gate the next checkpoint has
 * to edit to tell the truth.
 */
function checkExactlyOneNewOperation(rootDir, document, fail) {
  const surface = acceptedSurface(rootDir);
  const paths = Object.keys(document.paths ?? {});
  let operations = 0;
  for (const path of paths) {
    for (const method of Object.keys(document.paths[path])) {
      if (['get', 'put', 'post', 'patch', 'delete'].includes(method)) operations += 1;
    }
  }
  if (paths.length !== surface.paths) {
    fail(
      `${CANONICAL_FILES.openapi}: ${String(paths.length)} paths; expected ${String(surface.paths)}`,
    );
  }
  if (operations !== surface.operations) {
    fail(
      `${CANONICAL_FILES.openapi}: ${String(operations)} operations; expected ${String(surface.operations)}`,
    );
  }
  const schemas = Object.keys(document.components?.schemas ?? {}).length;
  if (schemas !== surface.schemas) {
    fail(
      `${CANONICAL_FILES.openapi}: ${String(schemas)} schemas; expected ${String(surface.schemas)}`,
    );
  }

  // No generic asset address, however spelled, and no second Session-asset
  // delivery. The shape is what is banned, not one prefix.
  for (const path of paths) {
    if (!path.startsWith('/api/public/')) continue;
    if (!/\{[^}]*[Aa]ssetId\}/.test(path)) continue;
    if (path === ROUTE) continue;
    if (path === '/api/public/design-templates/{slug}/versions/{version}/assets/{assetId}')
      continue;
    fail(`${CANONICAL_FILES.openapi}: "${path}" is a public asset address no checkpoint owns`);
  }
  for (const path of paths) {
    if (!/design-sessions/.test(path)) continue;
    if (!/editor-preview|download|original|presign/.test(path)) continue;
    if (path === ROUTE) continue;
    fail(`${CANONICAL_FILES.openapi}: "${path}" is a second Session delivery address`);
  }
}

/** No migration, no dependency, no worker, frontend, Admin or Figma change. */
export function checkBoundaries(rootDir, fail) {
  const migrations = join(rootDir, MIGRATIONS);
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== EXPECTED_MIGRATIONS) {
    fail(`${MIGRATIONS}: ${String(count)} migrations; B06C adds none`);
  }

  const root = read(rootDir, 'rootPackage');
  if (root !== undefined) {
    const scripts = Object.keys(JSON.parse(root).scripts ?? {}).length;
    if (scripts !== ROOT_SCRIPTS) {
      fail(`${CANONICAL_FILES.rootPackage}: ${String(scripts)} scripts; B06C adds none`);
    }
  }

  // Every owned file lives under the API. A Storefront or worker file in this
  // checkpoint's own list would be `APP3-S06` or a worker change arriving under
  // a backend checkpoint's review.
  for (const key of OWNED_SOURCE) {
    const path = CANONICAL_FILES[key];
    if (!path.startsWith('apps/api/')) {
      fail(`${path}: B06C owns no file outside apps/api`);
    }
    if (!existsSync(join(rootDir, path))) {
      fail(`${path}: is missing`);
    }
  }

  // The delivery half must not reach `apps/storefront` at all — B06C publishes a
  // contract for `APP3-S06` to consume later and implements none of it.
  for (const key of OWNED_SOURCE) {
    if (/apps\/(storefront|admin|worker)/.test(code(rootDir, key))) {
      fail(`${CANONICAL_FILES[key]}: reaches a frontend or worker path`);
    }
  }
}

/** The scoped commands this checkpoint publishes. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  for (const id of [
    'CMD-CHECK-APP3-B06C',
    'CMD-TEST-APP3-B06C',
    'CMD-TEST-APP3-B06C-API',
    'CMD-TEST-APP3-B06C-INTEGRATION',
  ]) {
    if (!index.includes(id)) {
      fail(`${CANONICAL_FILES.index}: does not register ${id}`);
    }
  }
}

/** Every focused proof exists, so a checkpoint cannot drop the half that hurts. */
export function checkTestsExist(rootDir, fail) {
  for (const key of ['unitSpec', 'contractSpec', 'liveSpec']) {
    if (read(rootDir, key) === undefined) {
      fail(`${CANONICAL_FILES[key]}: is missing`);
    }
  }
}

const CHECKS = Object.freeze([
  ['predecessors', checkPredecessors],
  ['operation', checkOperation],
  ['authorization', checkAuthorization],
  ['eligibility', checkEligibility],
  ['read semantics', checkReadSemantics],
  ['operation ids', checkOperationIdStability],
  ['streaming', checkStreaming],
  ['headers', checkHeaders],
  ['read-only', checkReadOnly],
  ['boundaries', checkBoundaries],
  ['command index', checkCommandIndex],
  ['tests', checkTestsExist],
]);

export function runChecks(rootDir) {
  const failures = [];
  for (const [label, check] of CHECKS) {
    check(rootDir, (message) => failures.push(`${label}: ${message}`));
  }
  return failures;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href;

if (invokedDirectly) {
  const failures = runChecks(REPO_ROOT);
  if (failures.length > 0) {
    console.error(`check:app3-b06c — ${String(failures.length)} failure(s)`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(
    'check:app3-b06c — one private contextual binary read and no generic asset address: an ' +
      'asset id is subordinate and grants nothing, delivery requires the authorized ACTIVE ' +
      'unexpired Session, the DESIGN_SESSION_ASSET association, the CUSTOMER_UPLOAD/' +
      'CUSTOMER_PRIVATE lane, an inspection verdict of ACCEPTED and a READY unwatermarked ' +
      'NORMALIZED derivative carrying the whole quartet; the session id comes from the proved ' +
      'credential and never from the path; ORIGINAL, SVG, THUMBNAIL, CATALOG_PREVIEW, ' +
      'PREVIEW_WATERMARKED and MOCKUP are unnameable; object storage opens only after every ' +
      'term has held, from the private derivatives bucket, with the provider size reconciled ' +
      'against byte_size; responses are no-store, nosniff and inline with no filename, ETag, ' +
      'validator or range; every eligibility miss collapses into one 404 and a storage ' +
      'contradiction into a 503; the GET requires no revision, advances none, rotates no ' +
      'cookie and does not spend the mutation limit; and nothing on the path can write — with ' +
      'no migration, no dependency, no worker, frontend or Admin change and no root script.',
  );
}
