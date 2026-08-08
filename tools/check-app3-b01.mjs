#!/usr/bin/env node
/**
 * `APP3-B01` — Product placement authoring and the public manifest.
 *
 * The checkpoint's whole risk is **what a public read carries**. A manifest that
 * grew a background asset id, a storage key or a retirement column would keep
 * every functional test green while handing an anonymous caller the store's
 * private associations, so the absences are asserted as hard as the presences —
 * against the committed OpenAPI document, which is what consumers actually
 * receive, not against a document rebuilt in process.
 *
 * The second risk is authority drift. Placement belongs to Product/Catalog
 * (IMP-D041 PO-01) and geometry to `design-engine` (IMP-D045); both would be
 * quietly violated by code that compiles — a Design module import, or a two-line
 * `width / mm` check written inline because it is obvious. Each check names the
 * alternative it refuses. `check-app3-b01-concurrency.mjs` owns the third risk.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-b01.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3P02 } from './check-app3-p02.mjs';
import { checkPlacementConcurrency } from './check-app3-b01-concurrency.mjs';
import { acceptedAdminTemplatePaths, acceptedSessionPaths } from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_DIR = 'apps/api/src/modules/catalog';

export const CANONICAL_FILES = Object.freeze({
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  module: `${MODULE_DIR}/catalog-placement.module.ts`,
  policy: `${MODULE_DIR}/domain/product-placement.policy.ts`,
  repository: `${MODULE_DIR}/infrastructure/persistence/drizzle-product-placement.repository.ts`,
  geometry: `${MODULE_DIR}/application/product-placement-geometry.ts`,
  plan: `${MODULE_DIR}/application/product-placement.plan.ts`,
  service: `${MODULE_DIR}/application/product-placement.service.ts`,
  projection: `${MODULE_DIR}/application/product-placement.projection.ts`,
  adminController: `${MODULE_DIR}/presentation/admin-product-placement.controller.ts`,
  publicController: `${MODULE_DIR}/presentation/public-product-placement.controller.ts`,
  response: `${MODULE_DIR}/presentation/schemas/product-placement.response.ts`,
  request: `${MODULE_DIR}/presentation/schemas/admin-product-placement.request.ts`,
  errors: `${MODULE_DIR}/domain/product-placement.errors.ts`,
  contractSpec: `${MODULE_DIR}/presentation/product-placement.contract.spec.ts`,
  concurrencySpec: 'apps/api/test/integration/product-placement-concurrency.integration.spec.ts',
  productSides: 'packages/database/src/schema/catalog/product-sides.ts',
  appModule: 'apps/api/src/bootstrap/app.module.ts',
  rootManifest: 'package.json',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
});

/** The three operations §3 authorises, keyed by path. */
const OPERATIONS = Object.freeze({
  '/api/admin/products/{productId}/placement': {
    get: 'adminProductPlacement_get',
    put: 'adminProductPlacement_replace',
  },
  '/api/public/products/{slug}/placement': { get: 'publicProductPlacement_get' },
});

/** Never in a public placement schema, whatever the reason offered. */
const PRIVATE_FIELDS = Object.freeze([
  'backgroundAssetId',
  'retiredAt',
  'supersededById',
  'storageKey',
  'checksum',
  'bucket',
  'inspection',
  'expectedUpdatedAt',
]);

/** Root scripts stay at the GOV-Q01 count; a checkpoint script would be one more. */
const ROOT_SCRIPT_COUNT = 30;

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with comments removed, so prose explaining a rule cannot trip a scan. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function placementFiles(rootDir) {
  const found = [];
  const walk = (directory) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        extname(entry.name) === '.ts' &&
        !entry.name.endsWith('.spec.ts') &&
        entry.name.includes('placement')
      ) {
        found.push(full);
      }
    }
  };
  walk(join(rootDir, MODULE_DIR));
  return found;
}

/** 1, 2 — exactly three operations, at the ruled routes, with the ruled auth. */
function checkOperations(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi} is missing`);
    return;
  }
  const paths = JSON.parse(raw).paths ?? {};
  const placement = Object.keys(paths).filter((path) => /placement/i.test(path));
  const expected = Object.keys(OPERATIONS);

  for (const path of placement.filter((candidate) => !expected.includes(candidate))) {
    fail(`${path} is not one of the three APP3-B01 operations`);
  }
  for (const [path, methods] of Object.entries(OPERATIONS)) {
    const item = paths[path];
    if (item === undefined) {
      fail(`the ruled operation ${path} is missing`);
      continue;
    }
    for (const [method, operationId] of Object.entries(methods)) {
      const operation = item[method];
      if (operation === undefined) {
        fail(`${method.toUpperCase()} ${path} is missing`);
        continue;
      }
      if (operation.operationId !== operationId) {
        fail(
          `${method.toUpperCase()} ${path} is "${operation.operationId}", expected ${operationId}`,
        );
      }
      // Admin authoring is authenticated; the manifest is anonymous. Either one
      // wearing the other's contract is the whole security boundary inverted.
      const secured = JSON.stringify(operation.security ?? null).includes('adminSession');
      if (path.includes('/admin/') !== secured) {
        fail(`${method.toUpperCase()} ${path} has the wrong authentication contract`);
      }
    }
    for (const method of Object.keys(item).filter((key) => !(key in methods))) {
      fail(`${method.toUpperCase()} ${path} is an unruled fourth operation`);
    }
  }
}

/** 4, 8 — no private fact reaches a public reader, and retired rows do not. */
function checkPublicSurface(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) return;
  const schemas = JSON.parse(raw).components?.schemas ?? {};
  const publicPlacement = Object.entries(schemas).filter(([name]) =>
    /^PublicPlacement|^PublicProductPlacement/.test(name),
  );
  if (publicPlacement.length === 0) fail('the document declares no public placement schema');
  const serialized = JSON.stringify(Object.fromEntries(publicPlacement));
  for (const field of PRIVATE_FIELDS) {
    if (serialized.includes(field)) fail(`the public placement schema exposes "${field}"`);
  }

  const repository = code(read(rootDir, 'repository') ?? '');
  // The predicate, not a comment about it: a public read that lost `retired_at
  // is null` would serve a placement the store has withdrawn.
  if (!/isNull\(productSides\.retiredAt\)/.test(repository)) {
    fail('the public side query does not exclude retired sides');
  }
  if (!/isNull\(embroideryAreas\.retiredAt\)/.test(repository)) {
    fail('the public area query does not exclude retired areas');
  }
  const projection = code(read(rootDir, 'projection') ?? '');
  if (/PublicPlacementSideView[\s\S]{0,400}backgroundAssetId/.test(projection)) {
    fail('the public projection carries the background association');
  }
}

/** 3, 11 — Catalog owns placement, and no adjacent checkpoint shipped with it. */
function checkOwnership(rootDir, fail) {
  const module = read(rootDir, 'module') ?? '';
  if (!/class CatalogPlacementModule/.test(module)) {
    fail('placement is not delivered as a Catalog module');
  }
  if (!/CatalogPlacementModule/.test(read(rootDir, 'appModule') ?? '')) {
    fail('CatalogPlacementModule is not composed into the application');
  }
  for (const file of placementFiles(rootDir)) {
    const source = code(readFileSync(file, 'utf8'));
    const shown = file.slice(rootDir.length + 1);
    // `design/` with the trailing slash: it matches `../design/design.module`
    // and `../../modules/design/...` while leaving `@embroidery/design-engine`
    // and `@embroidery/design-document` — which are packages, not the module —
    // untouched.
    if (/from\s+'[^']*\bdesign\/[^']*'/.test(source)) {
      fail(`${shown} imports the Design module; placement is Catalog authority (PO-01)`);
    }
    for (const token of ['presign', 'getObject', 'createReadStream', 'S3Client', 'sharp']) {
      if (source.includes(token)) fail(`${shown} reaches object storage or a decoder ("${token}")`);
    }
  }
  const raw = read(rootDir, 'openapi');
  if (raw !== undefined) {
    const paths = Object.keys(JSON.parse(raw).paths ?? {});
    // Mode-aware on `APP3-B02`, which owns exactly one of these shapes; every
    // other one still belongs to a checkpoint that has not run.
    const phase = read(rootDir, 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md');
    const b02Path = /APP3-B02\s*=\s*COMPLETE/.test(phase ?? '')
      ? '/api/public/products/{slug}/sides/{sideCode}/background'
      : undefined;
    const b07Paths = acceptedSessionPaths(rootDir);
    // `APP3-B03` publishes the two Admin Design Template paths. The list comes
    // from the shared surface authority rather than a literal here: six gates
    // carried this same ban, and a seventh copy is how one of them keeps
    // refusing a route the phase already accepted.
    const b03Paths = acceptedAdminTemplatePaths(rootDir);
    // No leading slash: `design-sessions` and `design-templates` are the shapes
    // `APP3-B03`/`APP3-B06` will use, and a `/sessions` needle would miss both.
    for (const forbidden of ['/sides/', '/areas/', 'templates', 'sessions', '/background']) {
      for (const path of paths.filter((candidate) => candidate.includes(forbidden))) {
        if (path === b02Path || b07Paths.includes(path) || b03Paths.includes(path)) continue;
        fail(`${path} belongs to a checkpoint that has not run`);
      }
    }
  }
}

/** 5, 6, 7 — the association, the eligibility predicate, and no storage lookup. */
function checkEligibility(rootDir, fail) {
  const sides = read(rootDir, 'productSides') ?? '';
  if (!/backgroundAssetId: idReference\('background_asset_id'\)\.notNull\(\)/.test(sides)) {
    fail('product_sides no longer carries background_asset_id as the association (PO-03)');
  }

  const repository = code(read(rootDir, 'repository') ?? '');
  for (const [fragment, complaint] of [
    ['bg_derivative.kind = ', 'the editor-safe derivative kind'],
    ['bg_derivative.status = ', 'the READY state'],
    ['bg_derivative.is_watermarked = false', 'the unwatermarked requirement'],
    ['bg_derivative.width_px is not null', 'width_px'],
    ['bg_derivative.height_px is not null', 'height_px'],
    ['bg_derivative.media_type is not null', 'media_type'],
    ['bg_derivative.byte_size is not null', 'byte_size'],
    ['bg_asset.deleted_at is null', 'the tombstone check'],
  ]) {
    if (!repository.includes(fragment)) {
      fail(`the eligibility predicate does not require ${complaint}`);
    }
  }

  const policy = code(read(rootDir, 'policy') ?? '');
  if (!/EDITOR_SAFE_DERIVATIVE_KIND = 'NORMALIZED'/.test(policy)) {
    fail('the editor-safe derivative kind is not NORMALIZED (IMP-D044 PO-01)');
  }
  if (!/REJECTED_SIDE_BACKGROUND_MEDIA_TYPE = 'image\/svg\+xml'/.test(policy)) {
    fail('SVG is not refused as a side-background source (IMP-D044 PO-03)');
  }
  // Dimensions come from the derivative row. An object-storage HEAD here would
  // make document validation depend on a network call (IMP-D044 PO-12).
  if (/objectStorage|headObject|contentLength/i.test(repository)) {
    fail('the repository appears to read dimensions from object storage');
  }
}

/** 9, 10 — DB01 protection respected, and geometry delegated to design-engine. */
function checkAuthorityReuse(rootDir, fail) {
  const geometry = code(read(rootDir, 'geometry') ?? '');
  if (!/from '@embroidery\/design-engine'/.test(geometry)) {
    fail('placement geometry does not use @embroidery/design-engine (IMP-D045)');
  }
  for (const helper of ['validateProductSideScaleConsistency', 'containsBounds', 'rectToBounds']) {
    if (!geometry.includes(helper)) fail(`the geometry seam does not reuse ${helper}`);
  }
  const plan = code(read(rootDir, 'plan') ?? '');
  for (const [pattern, complaint] of [
    [/assertSideScaleConsistent\(/, 'side scale consistency is not checked'],
    [/assertAreaWithinCanvas\(/, 'area containment is not checked'],
  ]) {
    if (!pattern.test(plan)) fail(complaint);
  }
  // A local scale check is the tempting shortcut and a second authority.
  for (const file of placementFiles(rootDir)) {
    const source = code(readFileSync(file, 'utf8'));
    if (file.endsWith('product-placement-geometry.ts')) continue;
    if (/imageWidthPx\s*\/\s*[\w.]*physicalWidthMm|pxPerMm\s*\*\s*/.test(source)) {
      fail(`${file.slice(rootDir.length + 1)} re-implements px/mm geometry`);
    }
  }

  const service = code(read(rootDir, 'service') ?? '');
  const repository = code(read(rootDir, 'repository') ?? '');
  if (!/'23000':/.test(service)) {
    fail('a referenced-placement guard violation is not translated to a stable error');
  }
  // Retirement is the removal path: a delete would defeat the guard by doing
  // exactly what it exists to prevent.
  if (/\.delete\(/.test(repository)) {
    fail('the placement repository deletes rows; retirement is the removal path (PO-07)');
  }
  for (const method of ['retireSide', 'retireArea']) {
    if (!repository.includes(method)) fail(`the repository has no ${method}`);
  }
}

/** 12, 14 — the generated client is current and no root script was added. */
function checkArtifacts(rootDir, fail) {
  // Orval camel-cases an operation id, so `adminProductPlacement_get` becomes
  // `adminProductPlacementGet`. Matching the raw id would silently pass for a
  // client that was never regenerated.
  const client = read(rootDir, 'client') ?? '';
  for (const methods of Object.values(OPERATIONS)) {
    for (const operationId of Object.values(methods)) {
      const exported = operationId.replace(/_(.)/g, (_, letter) => letter.toUpperCase());
      if (!client.includes(exported)) {
        fail(`the generated client does not carry ${exported}; regenerate it`);
      }
    }
  }
  const manifest = read(rootDir, 'rootManifest');
  if (manifest === undefined) {
    fail('the root package.json is missing');
  } else {
    const count = Object.keys(JSON.parse(manifest).scripts ?? {}).length;
    if (count !== ROOT_SCRIPT_COUNT) {
      fail(
        `the root package.json declares ${String(count)} scripts; GOV-Q01 fixed it at ${String(ROOT_SCRIPT_COUNT)}`,
      );
    }
  }
  const index = read(rootDir, 'commandIndex') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-B01',
    'CMD-TEST-APP3-B01',
    'CMD-TEST-APP3-B01-INTEGRATION',
  ]) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.commandIndex} does not index ${command}`);
  }
}

/** `APP3-B01-C1` — delegated, for the line limit. */
function checkConcurrencyContract(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) return;
  checkPlacementConcurrency(
    {
      document: JSON.parse(raw),
      // Orval splits the client: operations in one file, the request/response
      // interfaces in the other. The token lives in the second.
      client: `${read(rootDir, 'client') ?? ''}\n${read(rootDir, 'clientSchemas') ?? ''}`,
      request: code(read(rootDir, 'request') ?? ''),
      service: code(read(rootDir, 'service') ?? ''),
      repository: code(read(rootDir, 'repository') ?? ''),
      errors: read(rootDir, 'errors') ?? '',
      contractSpec: read(rootDir, 'contractSpec') ?? '',
      concurrencySpec: read(rootDir, 'concurrencySpec') ?? '',
    },
    fail,
  );
}

export function checkApp3B01(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkOperations(rootDir, fail);
  checkPublicSurface(rootDir, fail);
  checkConcurrencyContract(rootDir, fail);
  checkOwnership(rootDir, fail);
  checkEligibility(rootDir, fail);
  checkAuthorityReuse(rootDir, fail);
  checkArtifacts(rootDir, fail);

  // 13 — P02 chains G05 → P01 → F01/DB01 → G04 → G03 → G02 → G01, so one call
  // asserts the whole accepted authority this checkpoint implements.
  for (const violation of checkApp3P02(rootDir)) fail(`APP3-P02 regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3B01(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b01 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b01 — exactly three placement operations (adminProductPlacement_get/_replace ' +
      'behind an Admin session, publicProductPlacement_get anonymous); the manifest carries no ' +
      'background asset id, retirement, storage key or mutation field and excludes retired rows; ' +
      'placement stays Catalog-owned with no Design import, object-storage or decoder call; ' +
      'product_sides.background_asset_id remains the association and eligibility requires a READY ' +
      'NORMALIZED unwatermarked derivative with the full canonical quartet; geometry is delegated ' +
      'to @embroidery/design-engine; the DB01 guard is translated rather than worked around and ' +
      'nothing is deleted; the concurrency token is a published contract (read returns updatedAt, ' +
      'replace requires expectedUpdatedAt in the Catalog offset format, success returns the fresh ' +
      'token, the manifest exposes neither, the compare-and-set opens the transaction, and the ' +
      'generated client types it both ways); root scripts unchanged',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
