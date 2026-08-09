#!/usr/bin/env node
/**
 * `APP3-B02` — the public Side-background contract: route, DTO, manifest and
 * the published OpenAPI surface.
 *
 * Split from `check-app3-b02.mjs` by responsibility. That file asserts the
 * *delivery mechanics* — the contextual query, the stream lifecycle, the
 * headers, the reconciliation. This one asserts what the checkpoint **publishes**:
 * one anonymous operation keyed by public identities, a manifest that carries an
 * address and the intrinsic quartet, and no private fact anywhere in either.
 *
 * It also owns the canonical file map, so the dependency between the two halves
 * runs one way and there is no cycle.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-b02-contract.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { acceptedAdminSideBackgroundPaths, acceptedSurface } from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = 'apps/api/src/modules/catalog';

export const CANONICAL_FILES = Object.freeze({
  controller: `${CATALOG}/presentation/public-product-side-background.controller.ts`,
  contractSpec: `${CATALOG}/presentation/public-product-side-background.contract.spec.ts`,
  params: `${CATALOG}/presentation/schemas/public-side-background.request.ts`,
  placementResponse: `${CATALOG}/presentation/schemas/product-placement.response.ts`,
  placementController: `${CATALOG}/presentation/public-product-placement.controller.ts`,
  service: `${CATALOG}/application/public-side-background.service.ts`,
  serviceSpec: `${CATALOG}/application/public-side-background.service.spec.ts`,
  projection: `${CATALOG}/application/product-placement.projection.ts`,
  policy: `${CATALOG}/domain/public-side-background.policy.ts`,
  placementPolicy: `${CATALOG}/domain/product-placement.policy.ts`,
  errors: `${CATALOG}/domain/public-side-background.errors.ts`,
  apiPath: `${CATALOG}/domain/public-side-background-path.ts`,
  port: `${CATALOG}/domain/repositories/public-side-background.repository.ts`,
  placementPort: `${CATALOG}/domain/repositories/product-placement.repository.ts`,
  repository: `${CATALOG}/infrastructure/persistence/drizzle-public-side-background.repository.ts`,
  placementRepository: `${CATALOG}/infrastructure/persistence/drizzle-product-placement.repository.ts`,
  module: `${CATALOG}/catalog-public-side-background.module.ts`,
  appModule: 'apps/api/src/bootstrap/app.module.ts',
  contractHelper: 'packages/contracts/src/public-media/public-product-side-background-path.ts',
  contractIndex: 'packages/contracts/src/index.ts',
  integration: 'apps/api/test/integration/public-media-side-background.integration.spec.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  rootManifest: 'package.json',
});

/** The one operation this checkpoint publishes. */
export const B02_PATH = '/api/public/products/{slug}/sides/{sideCode}/background';
export const B02_OPERATION_ID = 'publicProductSideBackground_get';

const ROOT_SCRIPT_COUNT = 30;
const MIGRATION_COUNT = 34;

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with comments removed, so prose explaining a rule cannot trip a scan. */
export function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function openapi(rootDir) {
  const raw = read(rootDir, 'openapi');
  return raw === undefined ? undefined : JSON.parse(raw);
}

/** 1 — every canonical file exists. Everything after depends on it. */
function checkFilesExist(rootDir, fail) {
  for (const [key, path] of Object.entries(CANONICAL_FILES)) {
    if (read(rootDir, key) === undefined) fail(`${path} is missing`);
  }
}

/**
 * 2 — exactly one operation, keyed by public identities, anonymous, no body.
 *
 * The route being addressed by *slug and side code* rather than by an Asset or
 * derivative id is the checkpoint's central design decision: a background may be
 * replaced without the Side changing, so an artifact-keyed address would go
 * stale on every swap, while a placement-keyed one keeps resolving to whatever
 * the Side's current approved background is — and stops entirely once the
 * Product is unpublished.
 */
function checkOperation(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) return;

  // Mode-aware on `APP3-B02A`, which publishes the Admin counterpart of this
  // route. Before it, this is the only `/sides/` path there is; after it there
  // are exactly two and the second must be that one. Asserted as an exact set
  // rather than a count: "at most two" would admit any future side route.
  const expectedSidePaths = [B02_PATH, ...acceptedAdminSideBackgroundPaths(rootDir)].sort();
  const matching = Object.keys(document.paths ?? {})
    .filter((path) => path.includes('/sides/'))
    .sort();
  if (JSON.stringify(matching) !== JSON.stringify(expectedSidePaths)) {
    fail(
      `expected exactly one side path per delivered checkpoint ${JSON.stringify(expectedSidePaths)}; found ${JSON.stringify(matching)}`,
    );
    return;
  }

  const item = document.paths[B02_PATH];
  const methods = Object.keys(item).filter((key) =>
    ['get', 'post', 'put', 'patch', 'delete'].includes(key),
  );
  if (methods.length !== 1 || methods[0] !== 'get') {
    fail(`the side-background path exposes ${JSON.stringify(methods)}; exactly one GET is allowed`);
    return;
  }

  const operation = item.get;
  if (operation.operationId !== B02_OPERATION_ID) {
    fail(`the operation id is "${operation.operationId}"; expected "${B02_OPERATION_ID}"`);
  }
  if (operation.requestBody !== undefined) fail('the operation declares a request body');
  if (operation.security !== undefined) fail('the operation declares a security requirement');

  const parameters = (operation.parameters ?? []).filter((entry) => entry.in === 'path');
  const names = parameters.map((entry) => entry.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(['sideCode', 'slug'])) {
    fail(`the path parameters are ${JSON.stringify(names)}; expected slug and sideCode`);
  }
  if ((operation.parameters ?? []).some((entry) => entry.in === 'query')) {
    fail('the operation accepts a query parameter; no rendition selector is allowed');
  }

  const success = operation.responses?.['200']?.content ?? {};
  const types = Object.keys(success);
  if (types.length !== 1 || !types[0].startsWith('image/')) {
    fail(`the success response advertises ${JSON.stringify(types)}; one image type is expected`);
  }
  if (success[types[0]]?.schema?.format !== 'binary') {
    fail('the success response is not documented as binary');
  }
  for (const status of ['404', '503']) {
    if (operation.responses?.[status] === undefined) {
      fail(`the operation does not document a ${status} response`);
    }
  }
}

/**
 * 3 — no private identity reaches the wire.
 *
 * Checked against the published document rather than the source, because the
 * document is what a client is told. A field that leaked would be in the schema
 * whether or not any prose mentioned it.
 */
function checkNoPrivateIdentity(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) return;

  const background = document.components?.schemas?.PublicPlacementBackgroundResponse;
  const delivery = document.components?.schemas?.PublicPlacementBackgroundDeliveryResponse;
  if (background === undefined || delivery === undefined) {
    fail('the public background schemas are missing from the OpenAPI document');
    return;
  }

  for (const forbidden of [
    'backgroundAssetId',
    'assetId',
    'derivativeId',
    'storageKey',
    'bucket',
    'checksum',
    'retiredAt',
    'supersededById',
    'url',
    'href',
  ]) {
    for (const [name, schema] of [
      ['background', background],
      ['delivery', delivery],
    ]) {
      if (Object.keys(schema.properties ?? {}).includes(forbidden)) {
        fail(`the public ${name} schema exposes "${forbidden}"`);
      }
    }
  }

  const properties = Object.keys(delivery.properties ?? {}).sort();
  const expected = ['byteSize', 'heightPx', 'mediaType', 'path', 'widthPx'];
  if (JSON.stringify(properties) !== JSON.stringify(expected)) {
    fail(
      `the delivery schema exposes ${JSON.stringify(properties)}; expected ${JSON.stringify(expected)}`,
    );
  }
  if (!Object.keys(background.properties ?? {}).includes('delivery')) {
    fail('the public background schema carries no delivery reference');
  }

  // The published example must be relative. An absolute one would be copied.
  const example = String(delivery.properties?.path?.example ?? '');
  if (!example.startsWith('/api/')) fail(`the delivery path example "${example}" is not relative`);
}

/**
 * 4 — the manifest's delivery block is all-or-nothing.
 *
 * A path without dimensions would invite a request that cannot be served;
 * dimensions without a path would be fabricated geometry. The projection is
 * asserted to branch once, on the repository's own eligibility answer.
 */
function checkManifest(rootDir, fail) {
  const projection = code(read(rootDir, 'projection') ?? '');
  const port = code(read(rootDir, 'placementPort') ?? '');
  const repository = code(read(rootDir, 'placementRepository') ?? '');

  if (!/delivery: PublicBackgroundDelivery \| null/.test(projection)) {
    fail('the public background reference has no all-or-nothing delivery block');
  }
  if (!/row\.background === undefined/.test(projection)) {
    fail('the projection does not omit delivery when the background is not deliverable');
  }
  if (!/publicSideBackgroundPath\(\{ slug, sideCode: row\.code \}\)/.test(projection)) {
    fail('the delivery path is not composed from the slug and the side code');
  }
  if (/hasEligibleBackground/.test(projection + port + repository)) {
    fail('the superseded boolean eligibility flag survives');
  }
  if (!/side\.background !== undefined/.test(projection)) {
    fail('studioEligible is not derived from the deliverable background');
  }
  // The intrinsic dimensions and the authored canvas must stay distinct.
  if (!/widthPx: row\.background\.widthPx/.test(projection)) {
    fail('the delivery dimensions are not the derivative’s own');
  }
  if (/widthPx: row\.imageWidthPx|heightPx: row\.imageHeightPx/.test(projection)) {
    fail('the placement canvas is substituted for the derivative dimensions');
  }
  if (!/byte_size::text/.test(repository)) {
    fail('the manifest reads byte_size as a number, risking silent precision loss');
  }
}

/** 5 — one canonical helper, and an API composer proven equal to it. */
function checkRouteHelper(rootDir, fail) {
  const helper = code(read(rootDir, 'contractHelper') ?? '');
  const composer = code(read(rootDir, 'apiPath') ?? '');
  const index = read(rootDir, 'contractIndex') ?? '';
  const spec = read(rootDir, 'contractSpec') ?? '';

  if (!/export function buildPublicSideBackgroundPath/.test(helper)) {
    fail('the shared contracts package declares no side-background builder');
  }
  if (!index.includes('buildPublicSideBackgroundPath')) {
    fail('the shared builder is not exported from the contracts index');
  }
  for (const source of [helper, composer]) {
    if (
      !/encodeURIComponent\(slug\)/.test(source) ||
      !/encodeURIComponent\(sideCode\)/.test(source)
    ) {
      fail('a path builder does not encode both segments');
    }
    if (/https?:\/\/|process\.env|origin|host/i.test(source)) {
      fail('a path builder reaches for a host, an origin or the environment');
    }
  }
  // IMP-D018: the compiled API must not import the source-only package.
  if (/@embroidery\/contracts/.test(code(read(rootDir, 'projection') ?? ''))) {
    fail('the projection imports @embroidery/contracts; the compiled API cannot load it');
  }
  if (!spec.includes('@embroidery/contracts')) {
    fail('no spec proves the API composer equals the shared builder');
  }
  if (!/produces identical bytes/.test(spec)) {
    fail('the equivalence spec does not assert byte equality');
  }
}

/** 6 — nothing outside this checkpoint's remit moved. */
function checkBoundaries(rootDir, fail) {
  const document = openapi(rootDir);
  if (document !== undefined) {
    let operations = 0;
    for (const item of Object.values(document.paths ?? {})) {
      operations += Object.keys(item).filter((key) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(key),
      ).length;
    }
    if (operations !== acceptedSurface(rootDir).operations) {
      fail(
        `the document publishes ${operations} operations; APP3-B02 leaves exactly ${acceptedSurface(rootDir).operations}`,
      );
    }
    // The accepted APP2-T01 route must be untouched.
    if (
      document.paths?.['/api/public/products/{slug}/media/{productMediaId}/{rendition}'] ===
      undefined
    ) {
      fail('the accepted APP2-T01 media route is gone');
    }
  }

  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`there are ${count} migrations; APP3-B02 adds none to the ${MIGRATION_COUNT} it found`);
  }

  const manifest = JSON.parse(read(rootDir, 'rootManifest') ?? '{}');
  const scripts = Object.keys(manifest.scripts ?? {}).length;
  if (scripts !== ROOT_SCRIPT_COUNT) {
    fail(`the root manifest holds ${scripts} scripts; GOV-Q01 fixes it at ${ROOT_SCRIPT_COUNT}`);
  }

  const index = read(rootDir, 'commandIndex') ?? '';
  for (const id of [
    'CMD-CHECK-APP3-B02',
    'CMD-TEST-APP3-B02',
    'CMD-TEST-APP3-B02-INTEGRATION',
    'CMD-TEST-APP3-B02-STREAM',
  ]) {
    if (!index.includes(id)) fail(`${id} is not in the scoped command index`);
  }

  const phase = read(rootDir, 'phase') ?? '';
  if (!/APP3-B02 = COMPLETE/.test(phase)) fail('the phase status does not record APP3-B02');
  if (!/FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = COMPLETE — CLOSED_BY_APP3-B02/.test(phase)) {
    fail('the public-dimensions follow-up is not closed by this checkpoint');
  }
  // Mode-aware since `APP3-P03`: open before it, closed by it afterwards, and
  // never closed by nothing at all.
  if (/FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE — CLOSED_BY_APP3-P03/.test(phase)) {
    if (!/APP3-P03 = COMPLETE/.test(phase)) {
      fail(
        'the platform Zod/OpenAPI follow-up is closed by a checkpoint that is not recorded done',
      );
    }
  } else if (!/FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN/.test(phase)) {
    fail('the platform body follow-up was closed or altered');
  }

  const module = code(read(rootDir, 'module') ?? '');
  const appModule = code(read(rootDir, 'appModule') ?? '');
  if (!appModule.includes('CatalogPublicSideBackgroundModule')) {
    fail('the delivery module is not composed into the application');
  }
  for (const forbidden of ['AuditContextModule', 'OutboxModule', 'AuthenticatedAdminGuard']) {
    if (module.includes(forbidden)) fail(`the public delivery module imports "${forbidden}"`);
  }
}

export function checkApp3B02Contract(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkFilesExist(rootDir, fail);
  checkOperation(rootDir, fail);
  checkNoPrivateIdentity(rootDir, fail);
  checkManifest(rootDir, fail);
  checkRouteHelper(rootDir, fail);
  checkBoundaries(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp3B02Contract(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b02-contract — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b02-contract — exactly one anonymous binary GET keyed by Product slug and Side ' +
      'code, with no request body, no query rendition selector, no security requirement and a ' +
      'documented binary response; no Asset, derivative, storage or retirement identity in the ' +
      'route or in either public schema; a manifest whose delivery block carries a relative path ' +
      'and the intrinsic quartet all-or-nothing, with the placement canvas never substituted for ' +
      'the derivative dimensions; one canonical route helper with an API composer proven equal to ' +
      'it byte for byte and no contracts import in compiled code; and 23 operations, 34 ' +
      'migrations and 30 root scripts unchanged',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
