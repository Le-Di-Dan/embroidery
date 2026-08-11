#!/usr/bin/env node
/**
 * `APP3-B05A` — the one contextual published Template asset delivery.
 *
 * The rules worth a machine are the ones that stay green while being wrong. A
 * delivery route that authorizes on the Asset id alone. A route that authorizes
 * on the durable association alone, so artwork removed from the public design
 * keeps serving. One that accepts any historical published Version, quietly
 * becoming a public Version-history API. One that trusts the publication that
 * happened rather than the eligibility that holds now, so a withdrawn Product
 * keeps delivering. One that reaches object storage before it has decided
 * anything, turning provider latency into an existence oracle. One that streams
 * the private ORIGINAL, or raw SVG, or a watermarked preview. One that sends a
 * cacheable response, so an unpublish cannot revoke it. Every one of those ships
 * a working system.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  B05A_STATUS_LINES,
  acceptedSurface,
  isB06CDelivered,
  isS01Delivered,
  publicTemplateAssetPath,
  publicTemplatePaths,
} from './app3-accepted-surface.mjs';
/**
 * The authorization half, split out by responsibility and re-exported so every
 * consumer keeps one entry point.
 *
 * The cycle is deliberate and safe: that module imports `CANONICAL_FILES`, `code`
 * and `read` from here, and touches none of them until a check is *called*, by
 * which time both modules have finished initialising.
 */
import {
  checkAuthorization,
  checkDeliverable,
  checkDocumentMembership,
} from './check-app3-b05a-authorization.mjs';

import {
  checkHeaders,
  checkNonDisclosure,
  checkReadOnly,
  checkStreaming,
} from './check-app3-b05a-transport.mjs';

export { checkAuthorization, checkDeliverable, checkDocumentMembership };
export { checkHeaders, checkNonDisclosure, checkReadOnly, checkStreaming };

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESIGN = 'apps/api/src/modules/design';

/** The one operation this checkpoint publishes, and its address. */
export const ROUTE = publicTemplateAssetPath();

/**
 * The one Session-credentialed asset address `APP3-B06C` owns.
 *
 * Written out rather than derived from the surface list: this gate's job is to
 * refuse everything it does not recognise, and deriving the exception from the
 * same registry the artifact is measured against would let a future edit widen
 * the ban and the exception together.
 */
const B06C_ROUTE = '/api/public/design-sessions/{sessionId}/assets/{assetId}/editor-preview';
export const OPERATION_ID = 'publicDesignTemplateAsset_get';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  rootPackage: 'package.json',
  port: `${DESIGN}/domain/repositories/public-design-template-asset.repository.ts`,
  adapter: `${DESIGN}/infrastructure/persistence/drizzle-public-design-template-asset.repository.ts`,
  service: `${DESIGN}/application/public-design-template-asset.service.ts`,
  membership: `${DESIGN}/domain/published-template-asset-membership.ts`,
  policy: `${DESIGN}/domain/public-design-template-asset.policy.ts`,
  errors: `${DESIGN}/domain/public-design-template-asset.errors.ts`,
  request: `${DESIGN}/presentation/schemas/public-design-template-asset.request.ts`,
  controller: `${DESIGN}/presentation/public-design-template-asset.controller.ts`,
  module: `${DESIGN}/design-template-asset-public.module.ts`,
  unitSpec: `${DESIGN}/public-design-template-asset.spec.ts`,
  contractSpec: `${DESIGN}/presentation/public-design-template-asset.contract.spec.ts`,
  liveSpec: 'apps/api/test/integration/public-template-asset-delivery.integration.spec.ts',
  // The revocation half. Split from the transport half by responsibility, and
  // because one file carrying both crossed the 600-line test maximum. Named
  // separately so a checkpoint cannot quietly drop the half that proves an
  // address is not a capability — which is the half that catches an
  // authorization proved once at publication and cached thereafter.
  revocationSpec: 'apps/api/test/integration/public-template-asset-revocation.integration.spec.ts',
});

/** Every source file this checkpoint owns, for the whole-file bans below. */
export const OWNED_SOURCE = Object.freeze([
  'port',
  'adapter',
  'service',
  'membership',
  'policy',
  'errors',
  'request',
  'controller',
  'module',
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

function openapi(rootDir) {
  const raw = read(rootDir, 'openapi');
  return raw === undefined ? undefined : JSON.parse(raw);
}

/** The predecessors this delivery route is only meaningful on top of. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    'APP3-B05 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-W01B = COMPLETE — REVIEW_ACCEPTED',
    'APP3-W01B-C1 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-DB01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B04A = COMPLETE — REVIEW_ACCEPTED',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
  if (!B05A_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-B05A is not recorded under a legitimate status`);
  }
  for (const line of [
    'APP3-B05A OPERATIONS = publicDesignTemplateAsset_get',
    'APP3-B05A WRITES = NONE',
    'APP3-B05A AUDIT = NONE',
    'APP3-B05A EVENTS = NONE',
    'APP3-B05A MIGRATION = NONE',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }

  // The intake follow-up stays open. B05A delivers bytes it did not create, and
  // a checkpoint that quietly closed the follow-up would be claiming an intake
  // surface nobody reviewed.
  if (!/FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: the TEMPLATE_SOURCE intake follow-up is no longer recorded`);
  }
  // S01 is the consumer, not part of this checkpoint — so while S01 has not
  // shipped, a phase document claiming it has is B05A implementing its own
  // consumer. Once `APP3-S01` legitimately delivers, the absence stops
  // describing the world and the assertion would be refusing an accepted
  // checkpoint; the authority answers which world this is.
  if (!isS01Delivered(rootDir) && /\nAPP3-S01 = COMPLETE/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: APP3-S01 is recorded complete; B05A does not implement it`);
  }
  // In either world, B05A owns no Storefront source. That is the half of the
  // rule that never stops being true.
  if (
    existsSync(join(rootDir, 'apps/storefront/src/features/design-studio')) &&
    !isS01Delivered(rootDir)
  ) {
    fail('apps/storefront/src/features/design-studio exists; B05A builds no Storefront feature');
  }
}

/** Exactly one operation, contextual, anonymous, binary, and no generic sibling. */
export function checkSurface(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }

  const surface = acceptedSurface(rootDir);
  const paths = Object.keys(document.paths ?? {}).length;
  const operations = Object.values(document.paths ?? {}).reduce(
    (total, methods) => total + Object.keys(methods).length,
    0,
  );
  const schemas = Object.keys(document.components?.schemas ?? {}).length;
  if (paths !== surface.paths || operations !== surface.operations) {
    fail(
      `${CANONICAL_FILES.openapi}: ${paths}/${operations}, expected ${surface.paths}/${surface.operations}`,
    );
  }
  if (surface.schemas !== undefined && schemas !== surface.schemas) {
    fail(`${CANONICAL_FILES.openapi}: ${schemas} schemas, expected ${surface.schemas}`);
  }

  const methods = document.paths?.[ROUTE];
  if (methods === undefined) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} is not published`);
    return;
  }
  const extra = Object.keys(methods).filter((method) => method !== 'get');
  if (extra.length > 0) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} also publishes ${extra.join(', ')}`);
  }
  const get = methods.get ?? {};
  if (get.operationId !== OPERATION_ID) {
    fail(
      `${CANONICAL_FILES.openapi}: ${ROUTE} publishes "${get.operationId}", expected "${OPERATION_ID}"`,
    );
  }
  if (get.security !== undefined) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} requires authentication — B05A is anonymous`);
  }
  if (get.requestBody !== undefined) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} declares a request body`);
  }
  // No query parameter at all: a rendition selector is a parameter that could
  // eventually choose the private original.
  const parameters = get.parameters ?? [];
  const query = parameters.filter((parameter) => parameter.in === 'query');
  if (query.length > 0) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} accepts a query parameter`);
  }
  for (const name of ['slug', 'version', 'assetId']) {
    if (!parameters.some((parameter) => parameter.in === 'path' && parameter.name === name)) {
      fail(`${CANONICAL_FILES.openapi}: ${ROUTE} does not carry the "${name}" path segment`);
    }
  }
  for (const status of ['200', '400', '404', '503']) {
    if (get.responses?.[status] === undefined) {
      fail(`${CANONICAL_FILES.openapi}: ${ROUTE} documents no ${status}`);
    }
  }
  const success = Object.keys(get.responses?.['200']?.content ?? {});
  if (success.includes('application/json') || success.length === 0) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} does not answer with a binary body`);
  }

  checkNoGenericAssetApi(document, fail, isB06CDelivered(rootDir));

  const client = read(rootDir, 'client') ?? '';
  if (!client.includes('publicDesignTemplateAssetGet')) {
    fail(`${CANONICAL_FILES.client}: the generated client does not carry the operation`);
  }
}

/**
 * No address serves an Asset outside the Template and Version that authorize it.
 *
 * Matched on the *shape* of the path rather than on one spelling: any published
 * route whose asset segment is not preceded by both a template and a version
 * segment is the generic access this checkpoint exists to refuse.
 */
function checkNoGenericAssetApi(document, fail, b06cDelivered) {
  for (const route of Object.keys(document.paths ?? {})) {
    // **Public** only. `APP2` publishes authenticated Admin asset operations by
    // id, and they are a different surface under a different authorization — a
    // ban that caught them would be refusing an accepted checkpoint's route.
    if (!route.startsWith('/api/public/')) continue;
    // Any public address whose identity is an Asset id, however it is spelled —
    // `/assets/{assetId}`, `/design-template-assets/{assetId}`, or a Session
    // variant. Matching the segment shape rather than one prefix is the point:
    // the ban is about what the address *is*, not what it is called.
    if (!/\{[^}]*[Aa]ssetId\}/.test(route)) continue;
    if (route === ROUTE) continue;
    // `APP3-B06C` owns Session asset delivery under a Session credential. Until
    // it was delivered this gate refused that route too, and correctly — an
    // unpublished route appearing on the surface is exactly what the ban is for.
    // Now that it exists, the world is enlarged by **naming its one address**
    // rather than by loosening the shape: any *other* Session-shaped asset route,
    // and any route B06C might have grown a second of, still fails here.
    if (b06cDelivered && route === B06C_ROUTE) continue;
    fail(`${CANONICAL_FILES.openapi}: "${route}" serves an asset outside APP3-B05A's context`);
  }
  for (const route of Object.keys(document.paths ?? {})) {
    if (!route.startsWith('/api/public/design-templates')) continue;
    if (route === ROUTE || publicTemplatePaths().includes(route)) continue;
    fail(`${CANONICAL_FILES.openapi}: "${route}" belongs to no accepted Template checkpoint`);
  }
}

/** No migration, no dependency, no worker, frontend or Figma change. */
export function checkBoundaries(rootDir, fail) {
  const migrations = join(rootDir, MIGRATIONS);
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== EXPECTED_MIGRATIONS) {
    fail(`${MIGRATIONS}: ${count} migrations, expected ${EXPECTED_MIGRATIONS}`);
  }

  const rootPackage = read(rootDir, 'rootPackage');
  if (rootPackage !== undefined) {
    const scripts = Object.keys(JSON.parse(rootPackage).scripts ?? {});
    if (scripts.length !== ROOT_SCRIPTS) {
      fail(`package.json: ${scripts.length} root scripts, expected ${ROOT_SCRIPTS}`);
    }
  }

  for (const key of [...OWNED_SOURCE, 'unitSpec', 'contractSpec', 'liveSpec', 'revocationSpec']) {
    if (read(rootDir, key) === undefined) fail(`${CANONICAL_FILES[key]}: missing`);
  }

  // Nothing this checkpoint owns may reach a worker, a frontend or a design file.
  for (const key of OWNED_SOURCE) {
    const source = read(rootDir, key) ?? '';
    for (const forbidden of ['apps/worker', 'apps/admin', 'apps/storefront', 'figma']) {
      if (source.includes(forbidden)) {
        fail(`${CANONICAL_FILES[key]}: reaches outside the API ("${forbidden}")`);
      }
    }
  }

  const index = read(rootDir, 'index') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-B05A',
    'CMD-TEST-APP3-B05A',
    'CMD-TEST-APP3-B05A-API',
    'CMD-TEST-APP3-B05A-INTEGRATION',
  ]) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.index}: does not index ${command}`);
  }
}

export function checkApp3B05A(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkPredecessors(rootDir, fail);
  checkSurface(rootDir, fail);
  checkAuthorization(rootDir, fail);
  checkDocumentMembership(rootDir, fail);
  checkDeliverable(rootDir, fail);
  checkStreaming(rootDir, fail);
  checkHeaders(rootDir, fail);
  checkNonDisclosure(rootDir, fail);
  checkReadOnly(rootDir, fail);
  checkBoundaries(rootDir, fail);
  return failures;
}

async function main() {
  const failures = checkApp3B05A(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b05a — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b05a — one anonymous contextual binary read and no generic asset address: an ' +
      'asset id is subordinate and grants nothing, and delivery requires all six terms together ' +
      '— a PUBLISHED unarchived template, the version that is public *right now* rather than any ' +
      'version that once was, that exact version’s canonical document placing the asset through ' +
      'an image element under APP3-P01, the durable design_template_assets association, the ' +
      'product/side/area chain re-asked of Catalog on every request and never repaired, and a ' +
      'READY unwatermarked NORMALIZED derivative carrying the whole quartet; the deliverables are ' +
      'exactly W01A’s raster and W01B’s already-sanitized SVG, with ORIGINAL, THUMBNAIL, ' +
      'CATALOG_PREVIEW, PREVIEW_WATERMARKED and MOCKUP unnameable and no re-sanitization on read; ' +
      'object storage is opened only after every term has held, from the private derivatives ' +
      'bucket, with the provider’s size reconciled against byte_size and the stream destroyed ' +
      'rather than a misleading length sent; responses are no-store, nosniff and inline with no ' +
      'filename, ETag, validator or range, because an immutable version does not make its ' +
      'authorisation context immutable; twelve reasons collapse into one 404 and a storage ' +
      'contradiction into a 503; and nothing on the path can write — no insert, update, delete, ' +
      'audit row, outbox event or normalization request — with no migration, no dependency, no ' +
      'worker or frontend change and no root script.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
