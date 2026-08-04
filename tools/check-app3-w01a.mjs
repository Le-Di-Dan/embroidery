#!/usr/bin/env node
/**
 * `APP3-W01A` — the raster editor-safe normalization consumer.
 *
 * The checkpoint's risk is not that the pipeline breaks; a broken pipeline fails
 * loudly. It is that a later edit makes something *easier* in a way that quietly
 * undoes `IMP-D046`: trusting a profile from the payload, scanning an Asset's
 * associations to find one that fits, copying the source metadata into the
 * quartet instead of measuring the output, adding an SVG branch, or letting a
 * `READY` row satisfy a request nobody re-authorized. Every one of those
 * compiles and passes a happy-path test.
 *
 * So the checks assert the **semantics and the negations**, against the real
 * source tree and the real schema, and never against a comment.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-w01a.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3G06 } from './check-app3-g06.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JOB_DIR = 'apps/worker/src/jobs/asset-normalization';

export const CANONICAL_FILES = Object.freeze({
  payload: `${JOB_DIR}/domain/asset-normalization.payload.ts`,
  policy: `${JOB_DIR}/domain/normalization-policy.ts`,
  outcome: `${JOB_DIR}/domain/normalization-outcome.ts`,
  port: `${JOB_DIR}/domain/repositories/asset-normalization.repository.ts`,
  association: `${JOB_DIR}/application/association-resolution.service.ts`,
  derivative: `${JOB_DIR}/application/normalized-derivative.service.ts`,
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

const ROOT_SCRIPT_COUNT = 30;
const MIGRATION_COUNT = 34;

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with comments removed, so prose explaining a rule cannot trip a scan. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function jobFiles(rootDir) {
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
      if (entry.isDirectory()) {
        if (entry.name !== 'tests') walk(full);
      } else if (extname(entry.name) === '.ts' && !entry.name.endsWith('.spec.ts')) {
        found.push(full);
      }
    }
  };
  walk(join(rootDir, JOB_DIR));
  return found;
}

/** 1 — the event, its payload and the untouched APP2 event. */
function checkEventContract(rootDir, fail) {
  const payload = code(read(rootDir, 'payload') ?? '');
  const inspection = code(read(rootDir, 'inspectionPayload') ?? '');

  for (const [pattern, complaint] of [
    [/ASSET_NORMALIZATION_EVENT_TYPE = 'asset\.normalization\.requested'/, 'the ruled event type'],
    [/ASSET_NORMALIZATION_PAYLOAD_VERSION = 1/, 'schema version 1'],
    [/normalizationPolicyVersion/, 'the policy version field'],
    [/PRODUCT_SIDE_BACKGROUND: 'productSideId'/, 'the Product Side reference field'],
    [/DESIGN_TEMPLATE_ASSET: 'designTemplateAssetId'/, 'the Template reference field'],
    [/DESIGN_SESSION_ASSET: 'designSessionAssetId'/, 'the Session reference field'],
  ]) {
    if (!pattern.test(payload)) fail(`the payload contract is missing ${complaint}`);
  }
  // Exact validation: an unknown field must be terminal, not ignored.
  if (!/ALLOWED_KEYS/.test(payload) || !/exactKeys/.test(payload)) {
    fail('the payload does not reject unknown fields exactly');
  }
  for (const forbidden of ['profile', 'ownerId', 'storageKey', 'sessionSecret', 'customerId']) {
    if (new RegExp(`readonly ${forbidden}\\b`).test(payload)) {
      fail(`the payload declares a forbidden field "${forbidden}"`);
    }
  }
  if (!/asset\.inspection\.requested/.test(inspection)) {
    fail('the accepted APP2 inspection event was renamed or removed');
  }
  if (/normalization/i.test(inspection)) {
    fail('the inspection payload was repurposed for normalization');
  }
}

/** 2 — the same worker architecture, and no second anything. */
function checkArchitecture(rootDir, fail) {
  const handler = code(read(rootDir, 'handler') ?? '');
  const module = code(read(rootDir, 'module') ?? '');
  const worker = code(read(rootDir, 'workerModule') ?? '');

  if (!/jobKind = ASSET_PROCESSING/.test(handler)) {
    fail('the handler does not reuse the ASSET_PROCESSING job kind');
  }
  if (!/registry\.register\(this\.handler\)/.test(module)) {
    fail('the handler is not registered in the existing registry');
  }
  if (!/AssetNormalizationModule/.test(worker)) {
    fail('the capability is not composed into the worker');
  }
  for (const file of jobFiles(rootDir)) {
    const source = code(readFileSync(file, 'utf8'));
    const shown = file.slice(rootDir.length + 1);
    for (const token of ['setInterval(', 'setTimeout(', 'cron', 'new Worker(', 'createQueue']) {
      if (source.includes(token)) {
        fail(`${shown} contains "${token}"; W01A adds no scheduler, sweep or queue`);
      }
    }
  }
}

/** 3, 4 — profile derivation is association-bound and never inferred. */
function checkProfileDerivation(rootDir, fail) {
  const association = code(read(rootDir, 'association') ?? '');
  const port = code(read(rootDir, 'port') ?? '');

  for (const [pattern, complaint] of [
    [/PRODUCT_SIDE_BACKGROUND: 'SIDE_BACKGROUND'/, 'the Product Side mapping'],
    [/DESIGN_TEMPLATE_ASSET: 'TEMPLATE_ASSET'/, 'the Template mapping'],
    [/DESIGN_SESSION_ASSET: 'SESSION_UPLOAD'/, 'the Session mapping'],
    [/association\.assetId !== assetId/, 'the association-points-at-this-Asset check'],
    [/!association\.active/, 'the active-association check'],
    [/LANE_BY_PROFILE/, 'the per-profile asset lane check'],
  ]) {
    if (!pattern.test(association)) fail(`profile derivation is missing ${complaint}`);
  }
  // The port must not offer a by-Asset association lookup at all: a scan cannot
  // be written without changing the contract first.
  if (/findAssociationsFor|listAssociations|associationsByAsset/i.test(port)) {
    fail('the repository port exposes an association scan by Asset');
  }
  if (!/findAssociation\(\s*\n?\s*kind/.test(port) && !/findAssociation\(/.test(port)) {
    fail('the repository port has no by-id association lookup');
  }
}

/** 5, 6 — raster-only sources and the exact limits. */
function checkMediaAndLimits(rootDir, fail) {
  const policy = code(read(rootDir, 'policy') ?? '');

  for (const [pattern, complaint] of [
    [/'image\/jpeg',\s*'image\/png',\s*'image\/webp'/, 'the raster allowlist'],
    [/maxSourceBytes: 10 \* 1024 \* 1024/, 'the 10 MiB source limit'],
    [/maxDecodedWidth: 4096/, 'the 4096 width limit'],
    [/maxDecodedHeight: 4096/, 'the 4096 height limit'],
    [/maxDecodedPixels: 16_777_216/, 'the decoded-pixel budget'],
    [/TEMPLATE_SVG_MEDIA_TYPE = 'image\/svg\+xml'/, 'the staged SVG media type'],
  ]) {
    if (!pattern.test(policy)) fail(`the policy is missing ${complaint}`);
  }
  if (/'image\/svg\+xml'/.test(policy.replace(/TEMPLATE_SVG_MEDIA_TYPE = 'image\/svg\+xml'/, ''))) {
    fail('SVG appears in the policy beyond its single staged constant');
  }

  // No sanitizer may be introduced before APP3-G07.
  const manifest = read(rootDir, 'workerManifest') ?? '';
  for (const packageName of ['dompurify', 'svgo', 'sanitize-svg', 'xmldom', 'svg-sanitizer']) {
    if (manifest.includes(packageName)) {
      fail(`the worker manifest gained the sanitizer dependency "${packageName}"`);
    }
  }
  const derivative = code(read(rootDir, 'derivative') ?? '');
  if (!/TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE/.test(derivative)) {
    fail('Template SVG does not return the staged-capability outcome');
  }
  if (/sharp\(/.test(derivative)) {
    fail('the derivative service constructs a decoder directly instead of the shared pipeline');
  }
}

/** 7, 8, 9 — output policy, measured quartet and atomic completion. */
function checkOutputContract(rootDir, fail) {
  const policy = code(read(rootDir, 'policy') ?? '');
  const derivative = code(read(rootDir, 'derivative') ?? '');
  const repository = code(read(rootDir, 'repository') ?? '');
  const usecase = code(read(rootDir, 'usecase') ?? '');

  if (!/kind: 'NORMALIZED'/.test(policy)) fail('the output kind is not NORMALIZED');
  if (!/isWatermarked: false/.test(policy)) fail('the output policy does not fix isWatermarked');
  if (!/mediaType: 'image\/webp'/.test(policy)) fail('the output media type is not fixed');
  if (!/NORMALIZATION_POLICY_VERSION = 1/.test(policy)) fail('the policy version is not 1');

  // The quartet must come from the encoder and the counted stream.
  for (const [pattern, complaint] of [
    [/info\.read\(\)/, 'the encoder output report'],
    [/counter\.digest\(\)/, 'the counted checksum'],
    [/BigInt\(counter\.byteSize\)/, 'the counted byte size'],
    [/widthPx: produced\.width/, 'the measured width'],
    [/heightPx: produced\.height/, 'the measured height'],
  ]) {
    if (!pattern.test(derivative)) fail(`the quartet does not use ${complaint}`);
  }
  if (
    /widthPx: source\.|byteSize: source\.byteSize|mediaType: source\.mediaType/.test(derivative)
  ) {
    fail('the quartet substitutes source Asset metadata');
  }

  // One statement makes it usable, and it is guarded on this attempt's claim.
  if (!/status = 'READY'[\s\S]{0,400}width_px = \$\{input\.widthPx\}/.test(repository)) {
    fail('READY and the quartet are not persisted in one statement');
  }
  if (!/and status = 'PROCESSING'/.test(repository)) {
    fail('finalization is not guarded on this attempt’s claim');
  }
  if (/update assets set|update assets\s/.test(repository)) {
    fail('the normalization repository writes assets.status');
  }
  for (const kind of ['THUMBNAIL', 'CATALOG_PREVIEW']) {
    if (repository.includes(kind)) fail(`the repository references the APP2 kind ${kind}`);
  }
  // No storage call inside a transaction.
  if (
    /runInTransaction\([\s\S]{0,300}(putObjectStream|getObjectStream|deleteObject)/.test(usecase)
  ) {
    fail('an object-storage call happens inside a database transaction');
  }
}

/** 10, 11 — idempotency, and the schema left alone. */
function checkIdempotencyAndSchema(rootDir, fail) {
  const payload = code(read(rootDir, 'payload') ?? '');
  const usecase = code(read(rootDir, 'usecase') ?? '');
  const schema = read(rootDir, 'derivativeSchema') ?? '';

  if (
    /EFFECT_KEY_PREFIX\}\$\{payload\.assetId\}:\$\{String\(payload\.normalizationPolicyVersion\)/.test(
      payload,
    ) === false
  ) {
    fail('the effect key is not Asset + policy version');
  }
  if (
    /associationIdOf\(payload/.test(payload.split('deriveAssetNormalizationEffectKey')[1] ?? '')
  ) {
    fail('the effect key includes the association, so one Asset would get several derivatives');
  }
  // An existing result is only an answer after the association was proven.
  const resolveAt = usecase.indexOf('associations.resolve');
  const replayAt = usecase.indexOf('REPLAY_READY');
  if (resolveAt < 0 || replayAt < 0 || resolveAt > replayAt) {
    fail('an existing READY result can satisfy a request before its context is validated');
  }

  if (!/uq_asset_derivatives__asset_kind__not_failed/.test(schema)) {
    fail('the partial unique index that makes one derivative authoritative is gone');
  }
  for (const forbidden of ['processing_profile', 'editor_profile', 'association_id']) {
    if (schema.includes(forbidden)) fail(`asset_derivatives gained "${forbidden}"`);
  }
  for (const forbidden of ['EDITOR_SAFE', 'STUDIO_PREVIEW', 'SESSION_PREVIEW']) {
    if (schema.includes(forbidden)) fail(`a new derivative kind "${forbidden}" was added`);
  }
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(
      `the repository has ${String(count)} migrations; W01A adds none (expected ${String(MIGRATION_COUNT)})`,
    );
  }
}

/** 12, 13 — no HTTP surface, and the governance facts. */
function checkScopeAndGovernance(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw !== undefined) {
    const document = JSON.parse(raw);
    const operations = Object.values(document.paths ?? {}).flatMap((item) =>
      Object.keys(item).filter((method) =>
        ['get', 'put', 'post', 'patch', 'delete'].includes(method),
      ),
    );
    if (operations.length !== 22) {
      fail(`the OpenAPI document declares ${String(operations.length)} operations; W01A adds none`);
    }
    if (JSON.stringify(document).includes('normalization')) {
      fail('an HTTP operation or schema mentions normalization; W01A adds no HTTP surface');
    }
  }

  const manifest = read(rootDir, 'rootManifest');
  if (manifest === undefined) {
    fail('the root package.json is missing');
  } else {
    const count = Object.keys(JSON.parse(manifest).scripts ?? {}).length;
    if (count !== ROOT_SCRIPT_COUNT) {
      fail(`the root package.json declares ${String(count)} scripts; GOV-Q01 fixed it at 30`);
    }
  }
  const index = read(rootDir, 'commandIndex') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-W01A',
    'CMD-TEST-APP3-W01A',
    'CMD-TEST-APP3-W01A-INTEGRATION',
  ]) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.commandIndex} does not index ${command}`);
  }
  const phase = read(rootDir, 'phase') ?? '';
  if (!/FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN/.test(phase)) {
    fail('the platform Zod/OpenAPI follow-up is no longer recorded as open');
  }
}

export function checkApp3W01A(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkEventContract(rootDir, fail);
  checkArchitecture(rootDir, fail);
  checkProfileDerivation(rootDir, fail);
  checkMediaAndLimits(rootDir, fail);
  checkOutputContract(rootDir, fail);
  checkIdempotencyAndSchema(rootDir, fail);
  checkScopeAndGovernance(rootDir, fail);

  // G06 chains B01 → P02 → G05 → P01 → F01/DB01 → G04 → G03 → G02 → G01, so one
  // call asserts the whole accepted authority this consumer implements.
  for (const violation of checkApp3G06(rootDir)) fail(`APP3-G06 regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3W01A(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-w01a — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-w01a — the raster normalization consumer implements IMP-D046: one new event on ' +
      'the existing registry and ASSET_PROCESSING job kind with no scheduler, sweep or queue; the ' +
      'payload names the association and the worker derives the profile from it by id, proving ' +
      'the pointer, the owner and the lane; JPEG/PNG/WebP only with 10 MiB, 4096 and 16,777,216 ' +
      'enforced; Template SVG returns the staged capability and no sanitizer exists; the quartet ' +
      'is measured from the encoder and the counted stream, never from the source; READY and all ' +
      'four fields land in one claim-guarded statement with no storage call inside a ' +
      'transaction; the effect key is Asset plus policy version so several associations converge ' +
      'on one derivative, and an existing result is only an answer after its context is ' +
      'revalidated; assets.status and the APP2 kinds are untouched; no migration, profile ' +
      'column, derivative kind, HTTP operation or root script was added',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
