#!/usr/bin/env node
/**
 * `APP3-B08` — Design Session autosave.
 *
 * The risk here is not a broken save; that fails loudly. It is a later edit
 * quietly turning autosave into something else: a read-then-write that only
 * looks like a CAS, a save that extends the session lifetime, a document trusted
 * because it is internally consistent, a media reference validated against the
 * document instead of against persistence, or an idempotency record added so a
 * lost response can be "safely" replayed — which would resurrect an edit the
 * customer already undid.
 *
 * Every one of those compiles and passes a happy-path test, so the checks assert
 * **semantics and negations** against the real tree and the real artifact.
 *
 * This gate does not read the completion report: an implementation gate that
 * required its own evidence could not pass before that evidence existed, which
 * is the circularity `APP3-B07` hit.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-b08.mjs [rootDir]
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { B08_C1_STATUS_LINES, B08_STATUS_LINES } from './app3-accepted-surface.mjs';
import { checkApp3B06B } from './check-app3-b06b.mjs';
import { checkGeneratedClient, checkSurface } from './check-app3-b08-contract.mjs';
import { CANONICAL_FILES, REPO_ROOT, code, read, requireAll } from './check-app3-b08-files.mjs';

export { CANONICAL_FILES, REPO_ROOT, read };

const [ROOT_SCRIPTS, MIGRATIONS] = [30, 34];
const [SOFT_CHECKER, SOFT_TEST, SRC_LIMIT, TEST_LIMIT] = [450, 700, 400, 600];

/** 1 — the phase records B08 and every authority it rests on. */
export function checkStatus(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    'APP3-P01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-P02 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G03 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G04 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B06A = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B07 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B06B = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B06B-C1 = COMPLETE — REVIEW_ACCEPTED',
    // Cadence is a Studio concern; B08 must not acquire it by accident.
    'AUTOSAVE_CADENCE_OWNER = APP3-S11',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }

  // B08 and its correction each have exactly two legitimate states — under
  // foundation review, and accepted with it. Exactly one of each must be
  // recorded, so a status that drifted to neither is caught.
  for (const [subject, alternatives] of [
    ['APP3-B08', B08_STATUS_LINES],
    ['APP3-B08-C1', B08_C1_STATUS_LINES],
  ]) {
    if (!alternatives.some((line) => phase.includes(`\n${line}\n`))) {
      fail(
        `${CANONICAL_FILES.phase}: ${subject} is in none of its accepted states (${alternatives.join(' | ')})`,
      );
    }
  }
}

/** 3 — the document pipeline is P01's and P02's, never a local copy. */
export function checkDocumentAuthority(rootDir, fail) {
  requireAll(
    rootDir,
    'documents',
    [
      [/prepareDesignDocument/, 'does not run the P01 prepare pipeline (quantize + canonicalize)'],
      [/validateDesignDocumentContext/, 'does not run P01-C1 contextual media validation'],
      [/validatePlacementSnapshot/, 'does not run the P02 placement authority'],
      [/validateDocumentWithinEmbroideryArea/, 'does not run the P02 containment authority'],
      [/validateForSave/, 'has no save pipeline'],
    ],
    fail,
  );
  const source = code(read(rootDir, 'documents') ?? '');
  // A local schema would drift from P01 and start accepting what it does not.
  if (/z\.object\(|zod/.test(source)) {
    fail(`${CANONICAL_FILES.documents}: defines a local document schema instead of reusing P01`);
  }
  for (const forbidden of ['konva', 'fabric', 'canvas', 'jsdom', 'renderer']) {
    if (new RegExp(`from '[^']*${forbidden}`, 'i').test(source)) {
      fail(`${CANONICAL_FILES.documents}: imports rendering code "${forbidden}"`);
    }
  }
}

/** 4 — the placement authority is the Session's own persisted identity. */
export function checkPlacementAuthority(rootDir, fail) {
  requireAll(
    rootDir,
    'placement',
    [
      [
        /findPlacement\(\s*session\.productId/,
        'does not resolve placement from the persisted Product',
      ],
      [/session\.productSideId/, 'does not bind the Side to the persisted Session'],
      [/session\.embroideryAreaId/, 'does not bind the Area to the persisted Session'],
      [/area\.productSideId !== side\.id/, 'does not prove the Area belongs to that Side'],
      [/retiredAt/, 'discards retirement, so a retired placement would read as live'],
    ],
    fail,
  );
}

/** 5 — media eligibility is decided from persistence, and fails closed. */
export function checkMediaAuthority(rootDir, fail) {
  requireAll(
    rootDir,
    'mediaAuthority',
    [
      [/listAssetIds/, 'does not scope the allowlist to this Session'],
      [/listDerivativesFor/, 'does not read canonical derivative metadata'],
      [/widthPx|heightPx/, 'does not carry the DB01 metadata quartet'],
    ],
    fail,
  );
  const source = code(read(rootDir, 'mediaAuthority') ?? '');
  // `IMP-D044`: eligibility is never decided by fetching the binary.
  for (const forbidden of ['ObjectStorage', 'getObjectStream', 'headObject', 'putObject']) {
    if (source.includes(forbidden)) {
      fail(`${CANONICAL_FILES.mediaAuthority}: reads object storage to validate a document`);
    }
  }
  // The eligible kind/status are P01's constants; restating them here would be a
  // second definition of "editor-safe".
  if (/'NORMALIZED'|'READY'/.test(source)) {
    fail(`${CANONICAL_FILES.mediaAuthority}: restates the editor-safe derivative vocabulary`);
  }
}

/** 6 — one atomic CAS, and nothing autosave is forbidden to touch. */
export function checkDurableWrite(rootDir, fail) {
  const source = code(read(rootDir, 'useCase') ?? '');
  if (source === '') {
    fail(`${CANONICAL_FILES.useCase}: missing`);
    return;
  }
  for (const [pattern, complaint] of [
    [/saveDocument\(/, 'does not reuse the DB7 autosave CAS'],
    [/expectedRevision/, 'does not present the caller revision to the CAS'],
    [/runInTransaction/, 'does not wrap the durable write in a transaction'],
    [/designSessionStaleWrite\(\)/, 'does not map a stale write to the published 409'],
    [/STALE_WRITE/, 'does not recognise the stale-write guard'],
  ]) {
    if (!pattern.test(source)) fail(`${CANONICAL_FILES.useCase}: ${complaint}`);
  }

  // The negations. Each of these compiles and would pass a happy-path test.
  for (const [pattern, complaint] of [
    [/expiresAt\s*[:=]|expires_at/, 'touches the session expiry; the 30-day lifetime is absolute'],
    [/rotateSecret|sessionSecretHash\s*[:=]/, 'rotates or writes the session credential'],
    [/setHeader\(|Set-Cookie|serializeSessionCookie/, 'issues a cookie on autosave'],
    [
      /claimWithAllocation|IdempotencyAllocationStore|idempotencyRecords/,
      'adds autosave idempotency',
    ],
    [/outbox|OutboxEventStore/i, 'appends an event for a document save'],
    [/submit\(|submittedRequestId|customer/i, 'touches submission or customer identity'],
    [/debounce|intervalMs|cadence|retryTimer|queueDepth/i, 'takes autosave cadence from APP3-S11'],
  ]) {
    if (pattern.test(source)) fail(`${CANONICAL_FILES.useCase}: ${complaint}`);
  }

  // Validation must precede the transaction: the alternative holds a row lock
  // across work that cannot fail the CAS.
  const validateAt = source.indexOf('validateForSave');
  const transactionAt = source.indexOf('runInTransaction');
  if (validateAt >= 0 && transactionAt >= 0 && validateAt > transactionAt) {
    fail(`${CANONICAL_FILES.useCase}: validates inside the durable transaction`);
  }
}

/** 7 — the CAS itself still guards status, expiry and revision. */
export function checkCasContract(rootDir, fail) {
  requireAll(
    rootDir,
    'sessionRepository',
    [
      [/saveDocument\(input: SaveDocumentInput\)/, 'no longer exposes the autosave CAS'],
      [/expectedRevision/, 'lost the optimistic marker'],
    ],
    fail,
  );
  const source = read(rootDir, 'sessionRepository') ?? '';
  if (!/ACTIVE and not expired|G-DB7-19/.test(source)) {
    fail(`${CANONICAL_FILES.sessionRepository}: the ACTIVE/expiry guard is no longer stated`);
  }
}

/** 8 — B06A security is reused, not restated. */
export function checkSecurity(rootDir, fail) {
  const controller = code(read(rootDir, 'controller') ?? '');
  if (!/@Put\('.*sessionId.*document'\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the autosave route is not published`);
  }
  const autosaveBody = controller.slice(controller.indexOf('async autosave'));
  if (!/context\.designSessionId/.test(autosaveBody)) {
    fail(
      `${CANONICAL_FILES.controller}: autosave does not take the session from the guard context`,
    );
  }
  if (/params\.sessionId/.test(autosaveBody)) {
    fail(`${CANONICAL_FILES.controller}: autosave trusts the path parameter over the guard`);
  }
  // The guard must be on the route; without it every B06A check is bypassed.
  const guarded = /@Put\([^)]*\)[\s\S]{0,200}?@UseGuards\(DesignSessionGuard\)/.test(controller);
  if (!guarded) {
    fail(`${CANONICAL_FILES.controller}: autosave is not behind DesignSessionGuard`);
  }
  for (const forbidden of ['createHmac', 'timingSafeEqual', 'Sec-Fetch-Site', '__Host-']) {
    if (controller.includes(forbidden)) {
      fail(`${CANONICAL_FILES.controller}: re-implements B06A security ("${forbidden}")`);
    }
  }
  // One refusal for every document rejection: a per-rule reason is an oracle.
  if (!/designSessionDocumentRefused/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: document rejections do not collapse to one refusal`);
  }
}

/** 9 — the abuse limits B08 inherits are unchanged. */
export function checkRateLimits(rootDir, fail) {
  const source = read(rootDir, 'authConfig') ?? '';
  // `\b` matters: without it the pattern also matches a widened `300`, and the
  // check would pass on precisely the change it exists to refuse.
  if (!/mutation:\s*\{\s*max:\s*30\b/.test(source)) {
    fail(`${CANONICAL_FILES.authConfig}: the 30/minute mutation budget is no longer stated`);
  }
}

/** 10 — no migration, no dependency, no root script, no worker change. */
export function checkNoCollateral(rootDir, fail) {
  const manifest = read(rootDir, 'rootManifest');
  if (manifest !== undefined) {
    const scripts = Object.keys(JSON.parse(manifest).scripts ?? {}).length;
    if (scripts !== ROOT_SCRIPTS) {
      fail(`package.json: ${scripts} root scripts, expected ${ROOT_SCRIPTS}`);
    }
  }
  const migrations = join(rootDir, 'packages/database/migrations');
  if (existsSync(migrations)) {
    const count = readdirSync(migrations).filter((name) => name.endsWith('.sql')).length;
    if (count !== MIGRATIONS) {
      fail(`packages/database/migrations: ${count} migrations, expected ${MIGRATIONS}`);
    }
  }
  const module = code(read(rootDir, 'module') ?? '');
  for (const provider of [
    'AutosaveDesignSessionUseCase',
    'SessionPlacementResolver',
    'SessionDocumentMediaAuthority',
  ]) {
    if (!module.includes(provider)) {
      fail(`${CANONICAL_FILES.module}: ${provider} is not composed`);
    }
  }
}

/** 12 — the suites exist, are indexed, and stay inside the standard. */
export function checkTestsAndIndex(rootDir, fail) {
  for (const key of ['unitSpec', 'liveSpec', 'liveHarness']) {
    if (read(rootDir, key) === undefined) fail(`${CANONICAL_FILES[key]}: missing`);
  }
  const index = read(rootDir, 'commandIndex') ?? '';
  for (const id of [
    'CMD-CHECK-APP3-B08',
    'CMD-TEST-APP3-B08',
    'CMD-TEST-APP3-B08-API',
    'CMD-TEST-APP3-B08-INTEGRATION',
  ]) {
    if (!index.includes(id)) {
      fail(`${CANONICAL_FILES.commandIndex}: ${id} is not indexed`);
    }
  }
  // The live suite must actually run the race, and more than once.
  const live = read(rootDir, 'liveSpec') ?? '';
  if (!/iteration < 10|< 10;/.test(live)) {
    fail(`${CANONICAL_FILES.liveSpec}: the ten-iteration race is not present`);
  }
  if (!/Promise\.all\(/.test(live)) {
    fail(`${CANONICAL_FILES.liveSpec}: the race does not issue concurrent writers`);
  }
}

/** 13 — file sizes stay inside the standard. */
export function checkSizes(rootDir, fail) {
  for (const key of ['useCase', 'documents', 'placement', 'mediaAuthority', 'request']) {
    const text = read(rootDir, key);
    if (text === undefined) continue;
    const lines = text.split('\n').length;
    if (lines > SRC_LIMIT) fail(`${CANONICAL_FILES[key]}: ${lines} lines, above ${SRC_LIMIT}`);
  }
  for (const key of ['unitSpec', 'liveSpec']) {
    const text = read(rootDir, key);
    if (text !== undefined && text.split('\n').length > TEST_LIMIT) {
      fail(`${CANONICAL_FILES[key]}: above ${TEST_LIMIT} lines`);
    }
  }
  for (const [file, cap] of [
    ['tools/check-app3-b08.mjs', SOFT_CHECKER],
    ['tools/check-app3-b08-contract.mjs', SOFT_CHECKER],
    ['tools/check-app3-b08-files.mjs', SOFT_CHECKER],
    ['tools/check-app3-b08.test.mjs', SOFT_TEST],
  ]) {
    const text = read(rootDir, file);
    if (text === undefined) fail(`${file}: missing`);
    else if (text.split('\n').length > cap) {
      fail(`${file}: ${text.split('\n').length} lines, above ${cap}`);
    }
  }
}

export function checkApp3B08(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkStatus(rootDir, fail);
  checkSurface(rootDir, fail);
  checkDocumentAuthority(rootDir, fail);
  checkPlacementAuthority(rootDir, fail);
  checkMediaAuthority(rootDir, fail);
  checkDurableWrite(rootDir, fail);
  checkCasContract(rootDir, fail);
  checkSecurity(rootDir, fail);
  checkRateLimits(rootDir, fail);
  checkNoCollateral(rootDir, fail);
  checkGeneratedClient(rootDir, fail);
  checkTestsAndIndex(rootDir, fail);
  checkSizes(rootDir, fail);
  // The whole predecessor chain, through B06B.
  for (const message of checkApp3B06B(rootDir)) failures.push(`APP3-B06B regression: ${message}`);
  return failures;
}

async function main() {
  const failures = checkApp3B08(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b08 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b08 — one autosave operation replaces the Session document under a single ' +
      'atomic compare-and-set: ACTIVE and unexpired and at the caller revision, revision +1, ' +
      'stale answered 409 with nothing written; the document is judged by P01 (structure, ' +
      'complexity, quantization, canonicalization) and P02 (placement and containment) against ' +
      "the Session's own persisted Side and Area including their retirement, never by a local " +
      'copy of either; a placeable image must be a measured READY NORMALIZED derivative of an ' +
      'asset this Session uploaded or already referenced, decided from persistence and never ' +
      'from object storage; and autosave never extends expiry, never rotates or issues a ' +
      'credential, never records idempotency, never appends an event, and leaves cadence to ' +
      'APP3-S11; the snapshot publishes the P01 Design Document as generated components rather ' +
      'than an open object, so the contract and the generated client carry the real structure ' +
      'while P01 stays the acceptance authority — with no migration, root script or worker ' +
      'change, and one operator-authorized dev-only schema generator in @embroidery/design-document',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
