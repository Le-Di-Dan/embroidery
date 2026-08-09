#!/usr/bin/env node
/**
 * `APP3-B02A` — Admin Product Side background delivery.
 *
 * A just-in-time backend unblock for `APP3-A01`, so this gate asserts two
 * different kinds of thing:
 *
 * *That the checkpoint exists for a reason.* `APP3-B02` accepted, and `APP3-A01`
 * delivered and carrying the background-preview blocker. A JIT child whose
 * parent blocker had quietly disappeared would be scope nobody asked for.
 *
 * *That the operation stayed exactly one protected read.* One Admin route, an
 * authenticated guard, Product↔Side membership, **no** publication predicate,
 * binary out, and none of the storage capabilities a delivery route must never
 * grow: no presign, no generic asset GET, no upload, no mutation, no worker.
 *
 * The publication assertions run in **both** directions. Requiring publication
 * would break A01; silently serving *any* product's media to *any* caller would
 * be worse. So the gate demands that the publication predicate is absent **and**
 * that the Admin guard and the membership join are present.
 *
 * This gate does not read the completion report. A report is a claim; every fact
 * below is recomputed from the repository.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_FILES = {
  policy: 'apps/api/src/modules/catalog/domain/admin-side-background.policy.ts',
  errors: 'apps/api/src/modules/catalog/domain/admin-side-background.errors.ts',
  port: 'apps/api/src/modules/catalog/domain/repositories/admin-side-background.repository.ts',
  repository:
    'apps/api/src/modules/catalog/infrastructure/persistence/drizzle-admin-side-background.repository.ts',
  service: 'apps/api/src/modules/catalog/application/admin-side-background.service.ts',
  controller:
    'apps/api/src/modules/catalog/presentation/admin-product-side-background.controller.ts',
  params: 'apps/api/src/modules/catalog/presentation/schemas/admin-side-background.request.ts',
  module: 'apps/api/src/modules/catalog/catalog-admin-side-background.module.ts',
  appModule: 'apps/api/src/bootstrap/app.module.ts',
  spec: 'apps/api/src/modules/catalog/admin-side-background.spec.ts',
  integration: 'apps/api/test/integration/admin-side-background.integration.spec.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  phasePlan: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  rootManifest: 'package.json',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
};

export const ROUTE = '/api/admin/products/{productId}/sides/{sideId}/background';
export const OPERATION_ID = 'adminProductSideBackground_get';

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key]);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Comments explain what a file deliberately omits; rules must not match them. */
export function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function checkApp3B02a(rootDir) {
  const found = [];
  const fail = (message) => found.push(message);

  const policy = code(read(rootDir, 'policy') ?? '');
  const errors = code(read(rootDir, 'errors') ?? '');
  const repository = code(read(rootDir, 'repository') ?? '');
  const service = code(read(rootDir, 'service') ?? '');
  const controller = code(read(rootDir, 'controller') ?? '');
  const params = code(read(rootDir, 'params') ?? '');
  const module = code(read(rootDir, 'module') ?? '');
  const appModule = code(read(rootDir, 'appModule') ?? '');
  const plan = read(rootDir, 'phasePlan') ?? '';

  // --- entry authority -----------------------------------------------------
  if (!/\nAPP3-B02 = COMPLETE — REVIEW_ACCEPTED/.test(plan)) {
    fail('APP3-B02 is not recorded as accepted');
  }
  if (!/\nAPP3-A01 = COMPLETE — REVIEW_DELIVERED/.test(plan)) {
    fail('APP3-A01 is not recorded as delivered');
  }
  if (!/A01_REVIEW_BLOCKER = ADMIN_SIDE_BACKGROUND_PREVIEW_UNAVAILABLE/.test(plan)) {
    fail('the A01 background-preview blocker this checkpoint unblocks is not recorded');
  }

  // --- exactly one operation ----------------------------------------------
  const handlers = [...controller.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)];
  if (handlers.length !== 1) {
    fail(`the controller declares ${String(handlers.length)} operations, expected 1`);
  }
  if (!/@Get\(\)/.test(controller)) fail('the operation is not a GET');
  if (
    !/@Controller\('admin\/products\/:productId\/sides\/:sideId\/background'\)/.test(controller)
  ) {
    fail('the controller does not declare the derived Admin route');
  }
  if (!/class AdminProductSideBackgroundController/.test(controller)) {
    fail(`the controller class name does not derive ${OPERATION_ID}`);
  }

  // --- authorization -------------------------------------------------------
  if (!/@UseGuards\(AuthenticatedAdminGuard\)/.test(controller)) {
    fail('the route is not behind AuthenticatedAdminGuard');
  }
  if (!/@ApiCookieAuth\('adminSession'\)/.test(controller)) {
    fail('the operation does not publish its admin session requirement');
  }
  // Membership: the join is the proof the safe 404 depends on.
  if (!/eq\(productSides\.productId, products\.id\)/.test(repository)) {
    fail('the query does not join the Side to its Product');
  }
  if (!/eq\(products\.id, lookup\.productId\)/.test(repository)) {
    fail('the query does not filter on the requested Product id');
  }
  if (!/eq\(productSides\.id, lookup\.sideId\)/.test(repository)) {
    fail('the query does not filter on the requested Side id');
  }
  // Both fields, named — a single `z.string().uuid()` anywhere in the file
  // would satisfy a looser rule while the other segment accepted any string.
  for (const field of ['productId', 'sideId']) {
    if (!new RegExp(`${field}:\\s*z\\.string\\(\\)\\.uuid\\(\\)`).test(params)) {
      fail(`the params schema does not pin ${field} to a UUID`);
    }
  }
  if (!/\.strict\(\)/.test(params)) fail('the params schema is not strict');

  // --- no publication predicate (the reason this checkpoint exists) --------
  for (const forbidden of [
    'PRODUCT_PUBLISHED_STATE',
    'products.status',
    'products.archivedAt',
    'categories',
    'APP2_CATEGORY_STATUS',
  ]) {
    if (repository.includes(forbidden)) {
      fail(`the Admin query imposes a public-visibility predicate (${forbidden})`);
    }
  }

  // --- media policy reused, never re-declared ------------------------------
  // Asserted as the **predicate**, not as the identifier: a constant that is
  // merely imported and never compared satisfies a name-based rule while the
  // query it was supposed to constrain no longer checks anything.
  const LANE_PREDICATES = [
    ['assets.kind', 'SIDE_BACKGROUND_ASSET_KIND'],
    ['assets.classification', 'SIDE_BACKGROUND_ASSET_CLASSIFICATION'],
    ['assets.status', 'SIDE_BACKGROUND_ASSET_STATUS'],
    ['assetDerivatives.kind', 'EDITOR_SAFE_DERIVATIVE_KIND'],
    ['assetDerivatives.status', 'EDITOR_SAFE_DERIVATIVE_STATE'],
  ];
  for (const [column, constant] of LANE_PREDICATES) {
    const predicate = new RegExp(
      `eq\\(\\s*${column.replace('.', '\\.')}\\s*,\\s*${constant}\\s*\\)`,
    );
    if (!predicate.test(repository)) {
      fail(`the Admin query does not re-prove ${constant}`);
    }
    if (new RegExp(`${constant}\\s*=\\s*'`).test(policy)) {
      fail(`the policy re-declares ${constant} as a fresh literal`);
    }
  }
  if (/=\s*'[A-Z_]+'/.test(policy) || /image\/\w+/.test(policy)) {
    fail('the policy declares a media constant of its own instead of re-exporting');
  }
  if (/svg/i.test(policy) || /svg/i.test(repository)) {
    fail('SVG appears in the Admin delivery policy');
  }
  if (!/isWatermarked, false/.test(repository)) {
    fail('the query does not exclude watermarked artifacts (INV-22)');
  }
  if (!/isNull\(assets\.deletedAt\)/.test(repository)) {
    fail('the query does not exclude tombstoned Assets');
  }

  // --- delivery invariants, mirrored from B02 ------------------------------
  const lookup = service.indexOf('findDeliverable');
  const storage = service.indexOf('getObjectStream');
  if (lookup === -1) fail('the service does not resolve a descriptor at all');
  else if (storage !== -1 && storage < lookup) {
    fail('the service reaches object storage before the contextual read');
  }
  if (!/providerSize !== descriptor\.byteSize/.test(service)) {
    fail('the service does not reconcile the provider count against the persisted byte_size');
  }
  if (!/result\.body\.destroy\(\)/.test(service)) {
    fail('the service does not destroy the stream before refusing a contradicted object');
  }
  if (!/contentType: descriptor\.mediaType/.test(service)) {
    fail("the service does not send the derivative's persisted media type");
  }
  if (!/adminSideBackgroundNotFound\(\)/.test(service)) {
    fail('the service does not collapse every resolution miss into one not-found');
  }
  if (!/'no-store'/.test(read(rootDir, 'policy') ?? '') && !/CACHE_CONTROL/.test(policy)) {
    fail('the policy does not fix a no-store cache control');
  }
  if (/ETag|If-None-Match|Range|Accept-Ranges/i.test(controller)) {
    fail('the route adds a media protocol surface B02 does not have');
  }

  // --- capabilities the route must never grow ------------------------------
  const surface = module + service + controller + repository;
  for (const forbidden of [
    'presign',
    'putObject',
    'deleteObject',
    'getSignedUrl',
    'assets/:assetId',
    'ORIGINALS',
  ]) {
    if (surface.toLowerCase().includes(forbidden.toLowerCase())) {
      fail(`the delivery surface exposes ${forbidden}`);
    }
  }
  if (!/imports:\s*\[[^\]]*IdentityModule/.test(module)) {
    fail('the module does not import the identity boundary the guard needs');
  }
  for (const forbidden of ['CatalogPlacementModule', 'CatalogDraftModule', 'AuditModule']) {
    if (module.includes(forbidden)) {
      fail(`the module imports ${forbidden}, acquiring a capability a read must not have`);
    }
  }
  // Inside the `imports` array, not anywhere in the file: the import statement
  // at the top mentions the class too, and a module that is imported but never
  // registered contributes no route at all.
  const rootImports = /imports:\s*\[([\s\S]*?)\n {2}\]/.exec(appModule)?.[1] ?? '';
  if (!rootImports.includes('CatalogAdminSideBackgroundModule')) {
    fail('the module is not composed into the application root');
  }
  const errorCodes = [...errors.matchAll(/'(ADMIN_SIDE_BACKGROUND_[A-Z_]+)'/g)].map((m) => m[1]);
  if (new Set(errorCodes).size !== 3) {
    fail(`the error contract publishes ${String(new Set(errorCodes).size)} codes, expected 3`);
  }

  // --- published contract --------------------------------------------------
  const document = JSON.parse(read(rootDir, 'openapi') ?? '{}');
  const paths = Object.keys(document.paths ?? {});
  const operations = paths.reduce(
    (total, path) =>
      total +
      Object.keys(document.paths[path]).filter((verb) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(verb),
      ).length,
    0,
  );
  if (paths.length !== 32)
    fail(`the document publishes ${String(paths.length)} paths, expected 32`);
  if (operations !== 37) {
    fail(`the document publishes ${String(operations)} operations, expected 37`);
  }
  const published = document.paths?.[ROUTE]?.get;
  if (published === undefined) fail(`the document does not publish ${ROUTE}`);
  else {
    if (published.operationId !== OPERATION_ID) {
      fail(`the published operation id is ${String(published.operationId)}`);
    }
    const content = published.responses?.['200']?.content ?? {};
    const [mediaType] = Object.keys(content);
    if (mediaType === undefined || !mediaType.startsWith('image/')) {
      fail('the 200 response is not a concrete binary media type');
    } else if (content[mediaType]?.schema?.format !== 'binary') {
      fail('the 200 response schema is not binary');
    }
    if (JSON.stringify(published.responses?.['200'] ?? {}).includes('ApiSuccess')) {
      fail('the binary response is wrapped in the JSON envelope');
    }
    if (published.responses?.['401'] === undefined) {
      fail('the operation does not publish its unauthenticated refusal');
    }
    if (!JSON.stringify(published.security ?? []).includes('adminSession')) {
      fail('the operation does not publish adminSession security');
    }
  }

  const client = read(rootDir, 'client') ?? '';
  if (!/export const adminProductSideBackgroundGet/.test(client)) {
    fail('the generated client does not expose the operation');
  }
  // Scoped to **this** operation's request object. Two other operations already
  // stream blobs, so a file-wide search for the literal would keep passing after
  // this one silently became a JSON read.
  const clientCall =
    /url: `\/api\/admin\/products\/\$\{productId\}\/sides\/\$\{sideId\}\/background`,([\s\S]{0,200}?)\}/.exec(
      client,
    )?.[1];
  if (clientCall === undefined || !clientCall.includes("responseType: 'blob'")) {
    fail("the generated client does not use the repository's blob convention for this operation");
  }

  // --- no scope creep ------------------------------------------------------
  const scripts = Object.keys(JSON.parse(read(rootDir, 'rootManifest') ?? '{}').scripts ?? {});
  if (scripts.length !== 30) {
    fail(`root scripts changed to ${String(scripts.length)}, expected 30`);
  }
  for (const command of [
    'CMD-CHECK-APP3-B02A',
    'CMD-TEST-APP3-B02A',
    'CMD-TEST-APP3-B02A-API',
    'CMD-TEST-APP3-B02A-INTEGRATION',
  ]) {
    if (!(read(rootDir, 'commandIndex') ?? '').includes(command)) {
      fail(`${command} is not registered in the scoped command index`);
    }
  }
  for (const key of ['spec', 'integration']) {
    if (read(rootDir, key) === undefined) fail(`the ${key} suite is missing`);
  }

  return found;
}

// ---------------------------------------------------------------------------
if (process.argv[1]?.endsWith('check-app3-b02a.mjs')) {
  const findings = checkApp3B02a(REPO_ROOT);

  if (findings.length > 0) {
    console.error(`APP3-B02A check FAILED (${String(findings.length)} finding(s)):`);
    for (const failure of findings) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(
    'check:app3-b02a — one authenticated Admin operation streams a Product Side background for ' +
      'placement authoring: the Side must belong to the named Product, publication is deliberately ' +
      'not required so a DRAFT product can be authored, and the Asset lane, the editor-safe ' +
      'NORMALIZED derivative and the unwatermarked quartet are re-proved on every request from the ' +
      'one shared policy rather than a second literal; the object is streamed after the read and ' +
      'never before it, a provider/database size disagreement tears the stream down, no-store and ' +
      'nosniff are fixed, and there is no presign, upload, mutation, asset-by-id route or second ' +
      'operation.',
  );
}
