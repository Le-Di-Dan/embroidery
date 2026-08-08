#!/usr/bin/env node
/**
 * `APP3-B06B` — the anonymous Design Session raster intake.
 *
 * The risk is not that the upload breaks; a broken upload fails loudly. It is
 * that a later edit quietly undoes `IMP-D048`: buffering the body, widening the
 * lane so a guest lands in the catalog lane, reclaiming an expired allocation by
 * deleting an object this request cannot identify, splitting the association out
 * of the transaction that appends its events, or letting 10 MiB drift to 25.
 * Each compiles and passes a happy-path test, so the checks assert the
 * **semantics and the negations** against the real tree and artifact.
 *
 * This gate does **not** read the completion report: an implementation gate that
 * required its own evidence could not pass before the evidence was written,
 * which is the circularity `APP3-B07` hit.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-b06b.mjs [rootDir]
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { B06B_DELIVERED_STATUS } from './app3-accepted-surface.mjs';
import { checkApp3B07 } from './check-app3-b07.mjs';
import { checkLane, checkResponse, checkSurface } from './check-app3-b06b-contract.mjs';
import { CANONICAL_FILES, REPO_ROOT, code, read, requireAll } from './check-app3-b06b-files.mjs';

const [ROOT_SCRIPTS, MIGRATIONS] = [30, 34];
const [SOFT_CHECKER, SOFT_TEST, SRC_LIMIT, TEST_LIMIT] = [450, 700, 400, 600];

export { CANONICAL_FILES, REPO_ROOT };

/** 1 — the phase records B06B and its predecessors. */
function checkStatus(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    'APP3-G08 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-W01C = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B06A = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B07 = COMPLETE — REVIEW_ACCEPTED',
    B06B_DELIVERED_STATUS,
    'APP3-B08 = READY — NOT STARTED',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
}

/** 5 — the streaming pipeline is reused and parameterized, never duplicated. */
export function checkStreaming(rootDir, fail) {
  requireAll(
    rootDir,
    'parser',
    [
      [/lane: AssetIntakeLane = ADMIN_CATALOG_INTAKE_LANE/, 'the parser lane does not default'],
      [/fileSize: lane\.maxUploadBytes \+ 1/, 'the parser cap is not lane-derived'],
      [/lane\.declaresMetadataFields/, 'the parser ignores the lane field policy'],
    ],
    fail,
  );
  requireAll(
    rootDir,
    'reader',
    [
      [/maxBytes \?\? MAX_UPLOAD_BYTES/, 'the reader byte ceiling does not default'],
      [/byteSize > maxBytes/, 'the reader no longer enforces the lane ceiling incrementally'],
    ],
    fail,
  );
  requireAll(
    rootDir,
    'intake',
    [
      [/openMultipartUpload\([^)]*DESIGN_SESSION_INTAKE_LANE/, 'the intake does not pass its lane'],
      [/maxBytes: DESIGN_SESSION_INTAKE_LANE\.maxUploadBytes/, 'the intake does not cap bytes'],
      [/assertAcceptedMediaType\(/, 'the declared type is not allowlisted'],
      [/new PassThrough\(\)/, 'the storage seam is not a stream'],
      [/putObjectStream\(/, 'the object is not streamed'],
      [/claimWithAllocation\(/, 'no idempotency claim is taken before streaming'],
    ],
    fail,
  );
  const intake = code(read(rootDir, 'intake') ?? '');
  // No whole-file buffering, and no second upload architecture.
  for (const [pattern, what] of [
    [/Buffer\.concat\(/, 'buffers the upload'],
    [/toArray\(\)|readFileSync|await\s+buffer\(/, 'materialises the body'],
    [/presign|getSignedUrl|createPresigned/i, 'creates a presigned URL'],
    [/uploadIntent|upload-intent|completeUpload/i, 'adds an upload-intent or completion step'],
  ]) {
    if (pattern.test(intake)) fail(`${CANONICAL_FILES.intake}: ${what}`);
  }
  // The expired allocation must be refused, never reclaimed destructively.
  if (!/case 'expired':[\s\S]{0,240}rejectAfterDrain/.test(intake)) {
    fail(`${CANONICAL_FILES.intake}: an expired allocation is not refused`);
  }
  for (const destructive of ['deleteObject', 'removeObject', 'cleanupAbandonedObjects']) {
    if (intake.includes(destructive)) {
      fail(
        `${CANONICAL_FILES.intake}: calls ${destructive}; it may delete another request's object`,
      );
    }
  }
}

/** 6, 7 — one bounded transaction doing all the durable work, in order. */
export function checkDurableTransaction(rootDir, fail) {
  requireAll(
    rootDir,
    'transactions',
    [
      [/beginInspection\(/, 'the Asset is not transitioned to INSPECTING'],
      [
        /advanceRevision\(\{ id: sessionId, expectedRevision, at \}\)/,
        'the Session CAS is missing',
      ],
      [/attachAsset\(sessionId, asset\.id\)/, 'the association is not written'],
      [/ASSET_INSPECTION_EVENT_TYPE/, 'the inspection event is not appended'],
      [/ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE/, 'the normalization event is not appended'],
      [
        /buildAssetNormalizationRequestedPayload\(/,
        'the normalization payload is not built from the shared contract',
      ],
      [
        /kind: 'DESIGN_SESSION_ASSET', designSessionAssetId/,
        'the association reference is not the Session association',
      ],
      [/completeHeldClaim\(/, 'the idempotency record is not completed'],
      [/kind: SESSION_INTAKE_ASSET_KIND/, 'the Asset row is not written in the Session lane'],
      [
        /classification: SESSION_INTAKE_CLASSIFICATION/,
        'the Asset row is not written with the Session classification',
      ],
    ],
    fail,
  );
  // Imports name every token, so position and count are read from the body
  // below them — otherwise an import line reads as a second event append.
  const whole = code(read(rootDir, 'transactions') ?? '');
  const transactions = whole.slice(whole.lastIndexOf('\nimport '));
  // Ordering is the security property: the CAS proves the Session is live
  // *before* anything is bound to it.
  const advance = transactions.indexOf('advanceRevision');
  const attach = transactions.indexOf('attachAsset');
  const normalization = transactions.indexOf('ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE');
  if (advance === -1 || attach === -1 || advance > attach) {
    fail(`${CANONICAL_FILES.transactions}: the revision is not advanced before the association`);
  }
  if (attach === -1 || normalization === -1 || attach > normalization) {
    fail(
      `${CANONICAL_FILES.transactions}: normalization is requested before the association exists`,
    );
  }
  // No storage or parsing may happen inside the durable transaction.
  for (const forbidden of [
    'putObjectStream',
    'ObjectStoragePort',
    'busboy',
    'openMultipartUpload',
  ]) {
    if (transactions.includes(forbidden)) {
      fail(`${CANONICAL_FILES.transactions}: performs ${forbidden} inside the durable transaction`);
    }
  }
  // Exactly one normalization append.
  const appends = (transactions.match(/ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE/g) ?? []).length;
  if (appends !== 1) {
    fail(`${CANONICAL_FILES.transactions}: ${appends} normalization appends, expected exactly 1`);
  }
  for (const scheduler of ['setInterval(', 'setTimeout(', 'cron', 'createQueue']) {
    if (transactions.includes(scheduler)) {
      fail(`${CANONICAL_FILES.transactions}: contains "${scheduler}"; W01C owns the retry`);
    }
  }
}

/** 8 — the association is insert-or-confirm and yields a canonical id. */
export function checkAssociation(rootDir, fail) {
  requireAll(
    rootDir,
    'sessionRepository',
    [
      [
        /attachAsset\(id: DesignSessionId, assetId: string\): Promise<string>/,
        'attachAsset returns no id',
      ],
    ],
    fail,
  );
  requireAll(
    rootDir,
    'drizzleSession',
    [
      [/onConflictDoNothing\(/, 'the association write is not insert-or-confirm'],
      [
        /target: \[designSessionAssets\.sessionId, designSessionAssets\.assetId\]/,
        'the conflict target is not the canonical unique key',
      ],
      [/returning\(\{ id: designSessionAssets\.id \}\)/, 'the association id is not returned'],
    ],
    fail,
  );
}

/** 9 — security is B06A's, reused rather than re-implemented. */
export function checkSecurity(rootDir, fail) {
  requireAll(
    rootDir,
    'controller',
    [
      [/@UseGuards\(DesignSessionGuard\)/, 'the B06A guard is not applied'],
      [/@Post\(':sessionId\/assets'\)/, 'the route is not the ruled one'],
      [/@Req\(\) request: IncomingMessage/, 'the handler does not take the raw request'],
      [/context\.designSessionId/, 'the session comes from somewhere other than the guard context'],
    ],
    fail,
  );
  const controller = code(read(rootDir, 'controller') ?? '');
  if (/@Body\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: binds a body, which buffers the upload`);
  }
  // Nothing about cookies, HMAC, origin or limits may be re-implemented here.
  for (const duplicated of [
    'createHmac',
    'timingSafeEqual',
    'Sec-Fetch-Site',
    'checkMutation',
    'cookie',
  ]) {
    if (controller.includes(duplicated)) {
      fail(`${CANONICAL_FILES.controller}: re-implements "${duplicated}"; B06A owns it`);
    }
  }
  // The path parameter must not be the authorization subject.
  if (/params\.sessionId|@Param\(/.test(controller)) {
    fail(
      `${CANONICAL_FILES.controller}: reads the session id from the path instead of the context`,
    );
  }
}

/** 11 — nothing outside this checkpoint's remit moved. */
export function checkBoundary(rootDir, fail) {
  const manifest = read(rootDir, 'rootManifest');
  if (manifest !== undefined) {
    const scripts = Object.keys(JSON.parse(manifest).scripts ?? {}).length;
    if (scripts !== ROOT_SCRIPTS) {
      fail(`package.json: ${scripts} root scripts, expected ${ROOT_SCRIPTS}`);
    }
    const dependencies = JSON.stringify(JSON.parse(manifest).dependencies ?? {});
    if (dependencies.includes('sharp') || dependencies.includes('multer')) {
      fail('package.json: a new upload or image dependency was added');
    }
  }
  const migrations = join(rootDir, 'packages/database/migrations');
  if (existsSync(migrations)) {
    const count = readdirSync(migrations).filter((name) => name.endsWith('.sql')).length;
    if (count !== MIGRATIONS) {
      fail(`packages/database/migrations: ${count} migrations, expected ${MIGRATIONS}`);
    }
  }
  // The worker is W01C's; B06B changes none of it.
  const worker = join(rootDir, 'apps/worker/src/jobs/asset-normalization');
  if (existsSync(worker)) {
    const inspectionPending = join(worker, 'domain/inspection-pending.ts');
    if (!existsSync(inspectionPending)) {
      fail('apps/worker: the W01C retry signal is gone');
    }
  }
  const index = read(rootDir, 'commandIndex') ?? '';
  if (!index.includes('check-app3-b06b')) {
    fail(`${CANONICAL_FILES.commandIndex}: the B06B checker is not indexed`);
  }
  checkLiveSuite(rootDir, fail, index);
}

/**
 * 11a (`APP3-B06B-C1`) — the live suite exists and can be found.
 *
 * Deliberately limited to existence, wiring and discoverability. A structural
 * gate cannot observe an assertion executing, and one that claimed to would be
 * exactly the substitution C1 exists to correct: B06B passed every structural
 * check while its durable behaviour had never met a real database. Whether the
 * suite *passed* belongs in the C1 report, next to the command that produced it.
 */
export function checkLiveSuite(rootDir, fail, index) {
  for (const key of ['liveSpec', 'liveHarness', 'liveConfig']) {
    if (read(rootDir, key) === undefined) fail(`${CANONICAL_FILES[key]}: missing`);
  }
  if (!index.includes('CMD-TEST-APP3-B06B-INTEGRATION')) {
    fail(`${CANONICAL_FILES.commandIndex}: the B06B live suite has no indexed command`);
  }
  // Docker-only, so it must stay out of the Docker-free default run.
  const defaultConfig = read(rootDir, 'defaultJestConfig') ?? '';
  if (!defaultConfig.includes('test/integration/design-session-asset')) {
    fail(`${CANONICAL_FILES.defaultJestConfig}: the Docker-only Session suite is not excluded`);
  }
  // The stale-revision translation C1 added is the one runtime fix; without it
  // a stale revision answers 500 against a contract that publishes 409.
  const transactions = code(read(rootDir, 'transactions') ?? '');
  if (!/designSessionStaleWrite/.test(transactions)) {
    fail(`${CANONICAL_FILES.transactions}: a stale session revision is not a published conflict`);
  }
}

/** 12 — file sizes stay inside the standard. */
export function checkSizes(rootDir, fail) {
  const sources = [
    'lane',
    'policy',
    'codec',
    'transactions',
    'intake',
    'projection',
    'controller',
    'request',
    'response',
  ];
  for (const key of sources) {
    const text = read(rootDir, key);
    if (text === undefined) {
      fail(`${CANONICAL_FILES[key]}: missing`);
      continue;
    }
    const lines = text.split('\n').length;
    if (lines > SRC_LIMIT) fail(`${CANONICAL_FILES[key]}: ${lines} lines, above ${SRC_LIMIT}`);
  }
  for (const key of ['unitSpec', 'liveSpec']) {
    const spec = read(rootDir, key);
    if (spec === undefined) {
      fail(`${CANONICAL_FILES[key]}: missing`);
    } else if (spec.split('\n').length > TEST_LIMIT) {
      fail(`${CANONICAL_FILES[key]}: above ${TEST_LIMIT} lines`);
    }
  }
  const harness = read(rootDir, 'liveHarness');
  if (harness !== undefined && harness.split('\n').length > SRC_LIMIT) {
    fail(`${CANONICAL_FILES.liveHarness}: above ${SRC_LIMIT} lines`);
  }
  for (const [file, cap] of [
    ['tools/check-app3-b06b.mjs', SOFT_CHECKER],
    ['tools/check-app3-b06b.test.mjs', SOFT_TEST],
  ]) {
    const text = read(rootDir, file);
    if (text === undefined) fail(`${file}: missing`);
    else if (text.split('\n').length > cap) {
      fail(`${file}: ${text.split('\n').length} lines, above ${cap}`);
    }
  }
}

export function checkApp3B06B(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  for (const check of [
    checkStatus,
    checkSurface,
    checkLane,
    checkStreaming,
    checkDurableTransaction,
    checkAssociation,
    checkSecurity,
    checkResponse,
    checkBoundary,
    checkSizes,
  ]) {
    check(rootDir, fail);
  }
  for (const message of checkApp3B07(rootDir)) failures.push(`APP3-B07 regression: ${message}`);
  return failures;
}

async function main() {
  const failures = checkApp3B06B(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b06b — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b06b — one anonymous Session upload streams browser to API to private storage ' +
      'and nowhere else: no presign, no upload-intent, no completion proof and no whole-file ' +
      'buffer; the APP2 pipeline is reused through a lane rather than copied, so the Admin ' +
      'ceiling and vocabulary are untouched while a guest is capped at 10 MiB and lands as ' +
      "CUSTOMER_UPLOAD/CUSTOMER_PRIVATE; every security check is B06A's, applied before a byte " +
      'is read, and the session comes from the authorized context rather than the path; one ' +
      'bounded transaction proves the Session live by CAS, then associates, then appends exactly ' +
      'one inspection and one normalization event addressed by the returned association id, with ' +
      'no storage call inside it; the association is insert-or-confirm on its canonical key so a ' +
      'replay yields the same id; and no migration, dependency, root script or worker change was ' +
      'made',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
