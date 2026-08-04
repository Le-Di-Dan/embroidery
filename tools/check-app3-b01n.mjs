#!/usr/bin/env node
/**
 * `APP3-B01N` — the Product Side normalization request producer.
 *
 * The checkpoint's risk is not that the event fails to appear; a missing event
 * is caught by any test that looks for one. It is that a later edit makes the
 * producer *convenient* in a way that quietly breaks `IMP-D046`: restating the
 * event string in the API so the two applications can drift, putting a profile
 * in the payload, appending before the Side row exists or after the commit,
 * appending on a rename because "it is cheap", or deleting the derivative of the
 * Asset a Side moved away from. Every one of those compiles and passes a
 * happy-path test.
 *
 * So the checks assert the **semantics and the negations**, against the real
 * source trees, the real OpenAPI artifact, the real generated client and the
 * real schema — never against a comment.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-b01n.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3B01NArtifacts } from './check-app3-b01n-artifacts.mjs';
import { checkApp3W01A } from './check-app3-w01a.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_DIR = 'apps/api/src/modules/catalog';
const SHARED_DIR = 'packages/domain-types/src/events';

export const CANONICAL_FILES = Object.freeze({
  contract: `${SHARED_DIR}/asset-normalization-requested.ts`,
  contractIndex: 'packages/domain-types/src/index.ts',
  contractManifest: 'packages/domain-types/package.json',
  intents: `${CATALOG_DIR}/application/product-placement.normalization.ts`,
  recorder: `${CATALOG_DIR}/application/product-placement-normalization.recorder.ts`,
  service: `${CATALOG_DIR}/application/product-placement.service.ts`,
  plan: `${CATALOG_DIR}/application/product-placement.plan.ts`,
  module: `${CATALOG_DIR}/catalog-placement.module.ts`,
  workerPayload: 'apps/worker/src/jobs/asset-normalization/domain/asset-normalization.payload.ts',
  workerPolicy: 'apps/worker/src/jobs/asset-normalization/domain/normalization-policy.ts',
  apiManifest: 'apps/api/package.json',
  workerManifest: 'apps/worker/package.json',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  rootManifest: 'package.json',
});

const ROOT_SCRIPT_COUNT = 30;

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with comments removed, so prose explaining a rule cannot trip a scan. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(rootDir, relative) {
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
      else if (extname(entry.name) === '.ts' && !entry.name.endsWith('.spec.ts')) found.push(full);
    }
  };
  walk(join(rootDir, relative));
  return found;
}

/** 1, 2 — the shared contract exists, is runtime-loadable and owns the vocabulary. */
function checkSharedContract(rootDir, fail) {
  const contract = code(read(rootDir, 'contract') ?? '');
  const index = read(rootDir, 'contractIndex') ?? '';

  for (const [pattern, complaint] of [
    [
      /ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE = 'asset\.normalization\.requested'/,
      'the ruled event type',
    ],
    [/ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION = 1/, 'schema version 1'],
    [/ASSET_NORMALIZATION_POLICY_VERSION = 1/, 'policy version 1'],
    [/PRODUCT_SIDE_BACKGROUND: 'productSideId'/, 'the Product Side reference field'],
    [/DESIGN_TEMPLATE_ASSET: 'designTemplateAssetId'/, 'the Template reference field'],
    [/DESIGN_SESSION_ASSET: 'designSessionAssetId'/, 'the Session reference field'],
    [/buildAssetNormalizationRequestedPayload/, 'the payload builder'],
  ]) {
    if (!pattern.test(contract)) fail(`the shared event contract is missing ${complaint}`);
  }
  // The builder must fix both versions itself: a parameter for either would let
  // a producer announce rules it is not compiled against.
  if (/normalizationPolicyVersion:\s*input\./.test(contract)) {
    fail('the builder takes the policy version from its caller');
  }
  for (const forbidden of ['profile', 'storageKey', 'ownerId', 'sessionSecret']) {
    if (new RegExp(`readonly ${forbidden}\\b`).test(contract)) {
      fail(`the shared payload declares a forbidden field "${forbidden}"`);
    }
  }
  for (const name of [
    'ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE',
    'ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION',
    'ASSET_NORMALIZATION_POLICY_VERSION',
    'buildAssetNormalizationRequestedPayload',
  ]) {
    if (!index.includes(name)) fail(`${CANONICAL_FILES.contractIndex} does not export ${name}`);
  }

  // Runtime-loadable, or the compiled applications cannot require it (IMP-D018).
  const manifest = read(rootDir, 'contractManifest');
  if (manifest === undefined) {
    fail('the shared package manifest is missing');
    return;
  }
  const parsed = JSON.parse(manifest);
  if (!String(parsed.main ?? '').includes('dist')) {
    fail('the shared package resolves to source; the compiled apps could not require it');
  }
  if (!String(parsed.types ?? '').includes('dist')) fail('the shared package types are not built');
  if (parsed.scripts?.build === undefined) fail('the shared package has no build script');
}

/** 3 — both applications import the contract, and neither imports the other. */
function checkNoCrossImport(rootDir, fail) {
  const worker = code(read(rootDir, 'workerPayload') ?? '');
  const policy = code(read(rootDir, 'workerPolicy') ?? '');
  const recorder = code(read(rootDir, 'recorder') ?? '');

  if (!/@embroidery\/domain-types/.test(worker)) {
    fail('the consumer no longer imports the shared event contract');
  }
  if (!/ASSET_NORMALIZATION_POLICY_VERSION/.test(policy)) {
    fail('the consumer restates the policy version instead of importing it');
  }
  if (!/@embroidery\/domain-types/.test(recorder)) {
    fail('the producer no longer imports the shared event contract');
  }

  for (const [from, to, files] of [
    ['apps/api', 'apps/worker', sourceFiles(rootDir, 'apps/api/src')],
    ['apps/worker', 'apps/api', sourceFiles(rootDir, 'apps/worker/src')],
  ]) {
    // Both spellings: the workspace name, and a relative path that climbs out
    // of one application and back down into the other — which is what someone
    // reaching for a type would actually write, and which no package manifest
    // would record.
    const other = to.slice('apps/'.length);
    const patterns = [
      new RegExp(`from\\s*['"][^'"]*apps\\/${other}\\/`),
      new RegExp(`from\\s*['"][^'"]*\\.\\.\\/${other}\\/src\\/`),
      new RegExp(`from\\s*['"]@embroidery\\/${other}['"/]`),
    ];
    for (const file of files) {
      const source = code(readFileSync(file, 'utf8'));
      if (patterns.some((pattern) => pattern.test(source))) {
        fail(`${file.slice(rootDir.length + 1)} imports ${to}; ${from} must not`);
      }
    }
  }

  // And no second declaration of the event string anywhere in either app.
  for (const file of [
    ...sourceFiles(rootDir, 'apps/api/src'),
    ...sourceFiles(rootDir, 'apps/worker/src'),
  ]) {
    const source = code(readFileSync(file, 'utf8'));
    if (/['"]asset\.normalization\.requested['"]/.test(source)) {
      fail(`${file.slice(rootDir.length + 1)} restates the event type; the contract is shared`);
    }
  }
  for (const file of sourceFiles(rootDir, 'packages/domain-types/src')) {
    const source = code(readFileSync(file, 'utf8'));
    if (/@embroidery\/(persistence|database|object-storage)/.test(source)) {
      fail('the shared contract depends on a runtime package; it must stay a pure vocabulary');
    }
  }
}

/** 4, 8, 9 — exactly one Product Side reference per new or repointed Side. */
function checkProducerRule(rootDir, fail) {
  const intents = code(read(rootDir, 'intents') ?? '');
  const recorder = code(read(rootDir, 'recorder') ?? '');

  for (const [pattern, complaint] of [
    [/sides\.created/, 'the created-Side source'],
    [/sides\.updated/, 'the repointed-Side source'],
    [/fields\.backgroundAssetId/, 'the changed-background test'],
    [/!== undefined/, 'the "the stored background survived" test'],
  ]) {
    if (!pattern.test(intents)) fail(`the producer rule is missing ${complaint}`);
  }
  // Retirements schedule nothing, and nothing here may delete.
  if (/sides\.retired/.test(intents)) {
    fail('the producer reads the retirement list; a retirement schedules no work');
  }
  for (const file of [intents, recorder]) {
    for (const token of ['delete', 'discard', 'remove', 'purge']) {
      if (new RegExp(`\\b${token}\\w*\\(`, 'i').test(file)) {
        fail(`the producer calls "${token}"; the replaced Asset's derivative is never touched`);
      }
    }
  }
  if (!/kind: 'PRODUCT_SIDE_BACKGROUND'/.test(recorder)) {
    fail('the producer does not name the Product Side association kind');
  }
  for (const kind of ['DESIGN_TEMPLATE_ASSET', 'DESIGN_SESSION_ASSET']) {
    if (recorder.includes(kind)) fail(`the producer emits ${kind}; B01N owns Product Sides only`);
  }
  if (/profile/i.test(recorder.replace(/PROFILE_/g, ''))) {
    fail('the producer mentions a profile; the consumer derives it (IMP-D046 PO-03)');
  }
  if (!/aggregateKind: ASSET_KIND|aggregateKind: 'ASSET'/.test(recorder)) {
    fail('the event is not filed against the Asset aggregate');
  }
}

/** 5, 6, 7 — appended inside the transaction, after the Sides are written. */
function checkTransactionOrdering(rootDir, fail) {
  const service = code(read(rootDir, 'service') ?? '');
  const recorder = code(read(rootDir, 'recorder') ?? '');

  const transactionAt = service.indexOf('runInTransaction');
  const lockAt = service.indexOf('lockProductForReplace');
  const applyAt = service.indexOf('this.apply(plan)');
  const appendAt = service.indexOf('this.normalization.record');
  const returnAt = service.indexOf('return toAdminPlacementView');

  if (appendAt < 0) fail('the placement transaction never appends a normalization request');
  if (transactionAt < 0 || appendAt < transactionAt) {
    fail('the append is outside the placement transaction');
  }
  if (lockAt < 0 || appendAt < lockAt) fail('the append precedes the compare-and-set');
  if (applyAt < 0 || appendAt < applyAt) {
    fail('the append precedes the Side write, so it could name an id that does not exist');
  }
  if (returnAt < 0 || appendAt > returnAt) fail('the append happens after the response is built');

  // The recorder joins the caller's transaction; it must not open one, and must
  // not reach the network.
  if (/runInTransaction|TransactionManager/.test(recorder)) {
    fail('the recorder opens its own transaction instead of joining the caller’s');
  }
  for (const token of ['fetch(', 'axios', 'http', 'setTimeout(', 'setInterval(', 'void this']) {
    if (recorder.includes(token)) {
      fail(`the recorder contains "${token}"; the append is transactional, never fire-and-forget`);
    }
  }
  if (!/this\.outbox\.append/.test(recorder)) {
    fail('the recorder does not use the established transactional Outbox adapter');
  }
}

/** 11 — the accepted `APP3-B01` contract is untouched. */
function checkB01Unchanged(rootDir, fail) {
  const service = code(read(rootDir, 'service') ?? '');
  const plan = code(read(rootDir, 'plan') ?? '');
  const module = code(read(rootDir, 'module') ?? '');

  for (const [pattern, complaint] of [
    [/PLACEMENT_VERSION_CONFLICT/, 'the concurrency conflict code'],
    [/lockProductForReplace\(productId, command\.expectedUpdatedAt\)/, 'the CAS token'],
    [/assertBackgroundsUsable/, 'the background eligibility check'],
    [/PLACEMENT_REFERENCED_IMMUTABLE/, 'the DB01 guard translation'],
  ]) {
    if (!pattern.test(service)) fail(`APP3-B01 regression: ${complaint} is gone`);
  }
  if (!/backgroundAssetId !== current\.backgroundAssetId/.test(plan)) {
    fail('APP3-B01 regression: the plan no longer detects a changed background');
  }
  if (!/ProductPlacementNormalizationRecorder/.test(module)) {
    fail('the recorder is not composed into the placement module');
  }
  for (const controller of [
    'AdminProductPlacementController',
    'PublicProductPlacementController',
  ]) {
    if (!module.includes(controller)) fail(`APP3-B01 regression: ${controller} is no longer wired`);
  }
}

/** 15, 16 — the governance facts. */
function checkGovernance(rootDir, fail) {
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
    'CMD-CHECK-APP3-B01N',
    'CMD-TEST-APP3-B01N',
    'CMD-TEST-APP3-B01N-INTEGRATION',
  ]) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.commandIndex} does not index ${command}`);
  }
  const phase = read(rootDir, 'phase') ?? '';
  if (!/FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN/.test(phase)) {
    fail('the platform Zod/OpenAPI follow-up is no longer recorded as open');
  }

  // The workspace link must be a runtime dependency in both applications.
  for (const key of ['apiManifest', 'workerManifest']) {
    const parsed = JSON.parse(read(rootDir, key) ?? '{}');
    if (parsed.dependencies?.['@embroidery/domain-types'] === undefined) {
      fail(`${CANONICAL_FILES[key]} does not depend on the shared contract at runtime`);
    }
    if (parsed.devDependencies?.['@embroidery/domain-types'] !== undefined) {
      fail(`${CANONICAL_FILES[key]} hides the runtime requirement in devDependencies`);
    }
  }
}

export function checkApp3B01N(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkSharedContract(rootDir, fail);
  checkNoCrossImport(rootDir, fail);
  checkProducerRule(rootDir, fail);
  checkTransactionOrdering(rootDir, fail);
  checkB01Unchanged(rootDir, fail);
  checkApp3B01NArtifacts(rootDir, fail);
  checkGovernance(rootDir, fail);

  // W01A chains G06 → B01 → P02 → G05 → P01 → F01/DB01 → G04 → G03 → G02 → G01,
  // so one call asserts the whole accepted authority this producer feeds.
  for (const violation of checkApp3W01A(rootDir)) fail(`APP3-W01A regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3B01N(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b01n — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b01n — the placement transaction produces IMP-D046 normalization requests: one ' +
      'shared runtime-loadable event contract owned by @embroidery/domain-types and imported by ' +
      'both applications, with no cross-import and no second declaration of the event string; ' +
      'one request per created or repointed Product Side, named by the committed Side id, ' +
      'derived from the plan so a rename, a reorder, an Area edit, a geometry edit, a no-op save ' +
      'and a retirement append nothing; the append sits after the Side write and inside the ' +
      'compare-and-set transaction, joins it rather than opening one, and is never ' +
      'fire-and-forget; the replaced Asset is never scheduled for deletion; APP3-B01’s three ' +
      'operations, conflict code and guards are intact; and the OpenAPI artifact, the generated ' +
      'client, the migrations and the root scripts are byte-for-byte what they were',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
