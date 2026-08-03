#!/usr/bin/env node
/**
 * The `APP2-X01` phase-closure invariants.
 *
 * A closure verdict is the easiest thing in a repository to quietly falsify: a
 * status word is one edit away from turning a blocker into a pass, an owner is
 * one deletion away from vanishing, and a frozen hash copied into prose stops
 * matching the artifact the moment somebody regenerates it. This file makes the
 * closure matrix answerable to the repository instead of to itself.
 *
 * What it enforces, and why each one is here:
 *
 * - **Every canonical checkpoint is final, with both commits and a report that
 *   exists.** A row whose report file is missing, or whose hash is not a real
 *   40-hex object, is evidence that has been described rather than kept.
 * - **No forbidden checkpoint exists** — not as a row, not as a report. The
 *   `C2` names were ruled out explicitly; a phase that closes while one of them
 *   sits on disk has reinterpreted the ruling rather than followed it.
 * - **Every follow-up is nonblocking and owned.** `PASS_WITH_FOLLOW_UPS` is a
 *   real verdict only while that is true; an ownerless or blocking follow-up
 *   turns it into a blocker wearing a different word.
 * - **The frozen artifacts are recomputed, never trusted.** OpenAPI, client tree
 *   hash, migration count and fingerprint are read from the artifacts and
 *   compared with the matrix. The Figma registry is shared and appendable, so
 *   APP2 freezes its *owned* records, not global totals (`APP2-X01-C1`).
 * - **The public surface has not drifted** — routes, and the fact that
 *   `SAFE_STREAMED_NOT_FOUND` is still what the not-found authority is called.
 * - **Publication events are still `PENDING`** and the next phase is still not
 *   started.
 *
 * Historical and superseded prose stays legal throughout: a line that labels
 * itself as history is evidence, and criminalising it would push the phase's
 * own record out of the repository.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkFrozenArtifacts } from './check-app2-closure-artifacts.mjs';
import { isLabelled } from './check-storefront-route-authority.mjs';

export { measureFrozenArtifacts } from './check-app2-closure-artifacts.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_FILES = Object.freeze({
  matrix: 'docs/implementation/reports/APP2-CLOSURE-MATRIX.md',
  phase: 'docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md',
  roadmap: 'docs/implementation/10-MASTER-APPLICATION-ROADMAP.md',
});

const REPORT_DIR = 'docs/implementation/reports';

/** The closure verdict and the surface it is allowed to close over. */
export const EXPECTED = Object.freeze({
  phaseVerdict: 'COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW',
  closureCheckpoint: 'APP2-X01',
  e01Status: 'COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW',
  nextPhase: 'APP3',
  notFoundAuthority: 'SAFE_STREAMED_NOT_FOUND',
  routes: Object.freeze(['/kham-pha', '/san-pham/[slug]']),
  operations: Object.freeze([
    'publicProduct_list',
    'publicProduct_detail',
    'publicProductMedia_get',
  ]),
  openapiHash: 'c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8',
  openapiPaths: 16,
  openapiOperations: 19,
  openapiSchemas: 34,
  clientHash: '7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2',
  migrations: 33,
  tables: 78,
  columns: 833,
  checks: 190,
  fingerprint: '82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf',
  // APP2-X01-C1: owned records are frozen, never the shared registry's totals.
  figmaOwnedRows: 86,
  figmaOwnedTables: 11,
});

/**
 * Checkpoints ruled out by name. A report on disk is as much a violation as a
 * matrix row: the ruling was that they must not be created, not that they must
 * not be mentioned.
 */
export const FORBIDDEN_CHECKPOINTS = Object.freeze([
  'APP2-A03-C2',
  'APP2-A04-C2',
  'APP2-B02-C2',
  'APP2-B04-C2',
  'APP2-T01-C2',
  'APP2-S02-C2',
  'APP2-E01-C2',
  'APP2-D04',
  'APP2-S01-C1',
]);

/** A checkpoint row may only claim one of these. Nothing open, nothing pending. */
export const FINAL_STATUS_MARKERS = Object.freeze([
  'COMPLETE',
  'DELIVERED_FOR_PRODUCT_OWNER_REVIEW',
  'SUPERSEDED_BY_FINAL_PROCESS_PROOF',
]);

/** Words that would mean a checkpoint is not actually finished. */
export const REOPENED_MARKERS = Object.freeze([
  'BLOCKED',
  'IN_PROGRESS',
  'NOT STARTED',
  'PENDING',
  'CORRECTION_REQUIRED',
  'READY',
]);

const HASH = /^[0-9a-f]{40}$/;

function read(root, relative) {
  const abs = join(root, relative);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
}

/** Rows of the first Markdown table under a heading, as trimmed cell arrays. */
export function tableRows(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return [];
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n#{2,3} /);
  const block = end < 0 ? rest : rest.slice(0, end);
  return block
    .split('\n')
    .filter((line) => line.startsWith('| ') && !/^\|[\s|:-]+\|$/.test(line))
    .map((line) =>
      line
        .slice(1, line.endsWith('|') ? -1 : undefined)
        .split('|')
        .map((cell) => cell.trim().replaceAll('`', '').replaceAll('**', '')),
    )
    .filter((cells) => cells.length > 1 && !/^(Checkpoint|ID)$/.test(cells[0]));
}

/** `{id, status, commitA, commitB, report, blocking}` per checkpoint row. */
export function checkpointRows(matrixText) {
  return tableRows(matrixText, '## 1. Checkpoint matrix')
    .filter((cells) => cells.length >= 9)
    .map((cells) => ({
      id: cells[0],
      purpose: cells[1],
      status: cells[2],
      commitA: cells[3],
      commitB: cells[4],
      corrections: cells[5],
      report: cells[6],
      blocking: cells[7],
      followUps: cells[8],
    }));
}

/** `{id, status, blocking, owner, target, reason, source}` per follow-up row. */
export function followUpRows(matrixText) {
  return (
    tableRows(matrixText, '## 2. Follow-up register')
      // `FU-…` is the APP2 form; `APP1-FU02` is the inherited form. Both are
      // follow-ups and both must satisfy the owned-and-nonblocking rule.
      .filter((cells) => cells.length >= 9 && /^(FU-|APP\d+-FU)/.test(cells[0]))
      .map((cells) => ({
        id: cells[0],
        origin: cells[1],
        issue: cells[2],
        status: cells[3],
        blocking: cells[4],
        owner: cells[5],
        target: cells[6],
        reason: cells[7],
        source: cells[8],
      }))
  );
}

/** Lines that call the streamed not-found an exact HTTP 404, unlabelled. */
export function falseNotFoundClaims(text) {
  return text.split('\n').filter((line) => {
    const lower = line.toLowerCase();
    if (!/streamed|not-found authority|safe_streamed/.test(lower)) return false;
    if (!/\b404\b/.test(lower)) return false;
    return !isLabelled(line);
  });
}

/** Lines claiming the publication events were dispatched or consumed. */
export function dispatchedPublicationClaims(text) {
  return text.split('\n').filter((line) => {
    const lower = line.toLowerCase();
    if (!/product\.(un)?published|publication (outbox|events)/.test(lower)) return false;
    if (!/dispatched|consumed|delivered to a consumer/.test(lower)) return false;
    if (/dispatched\s*=\s*0|remain|stay|never|not dispatched|no app2 consumer/i.test(line)) {
      return false;
    }
    return !isLabelled(line);
  });
}

export async function checkApp2Closure(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const matrix = read(rootDir, CANONICAL_FILES.matrix);
  if (matrix === undefined) {
    fail(`${CANONICAL_FILES.matrix}: the canonical closure matrix is missing`);
    return failures;
  }
  const roadmap = read(rootDir, CANONICAL_FILES.roadmap) ?? '';
  const phase = read(rootDir, CANONICAL_FILES.phase) ?? '';

  checkCheckpoints(rootDir, matrix, fail);
  checkForbidden(rootDir, matrix, fail);
  checkFollowUps(matrix, fail);
  checkVerdict(matrix, roadmap, fail);
  checkSurface(matrix, phase, roadmap, fail);
  await checkFrozenArtifacts(rootDir, matrix, EXPECTED, fail);
  checkNextPhase(rootDir, matrix, roadmap, fail);

  return failures;
}

function checkCheckpoints(rootDir, matrix, fail) {
  const rows = checkpointRows(matrix);
  if (rows.length < 30) {
    fail(`${CANONICAL_FILES.matrix}: only ${rows.length} checkpoint row(s); the phase has 30+`);
  }
  const closure = rows.filter((row) => row.id === EXPECTED.closureCheckpoint);
  if (closure.length > 0) {
    fail(
      `${CANONICAL_FILES.matrix}: ${EXPECTED.closureCheckpoint} must not appear as a delivered row; it is the closure itself`,
    );
  }
  for (const row of rows) {
    if (!FINAL_STATUS_MARKERS.some((marker) => row.status.startsWith(marker))) {
      fail(`${CANONICAL_FILES.matrix}: ${row.id} is not final: "${row.status}"`);
    }
    if (REOPENED_MARKERS.some((marker) => row.status.includes(marker))) {
      fail(`${CANONICAL_FILES.matrix}: ${row.id} reopened: "${row.status}"`);
    }
    for (const [label, hash] of [
      ['Commit A/C', row.commitA],
      ['Commit B/D', row.commitB],
    ]) {
      if (!HASH.test(hash)) {
        fail(`${CANONICAL_FILES.matrix}: ${row.id} ${label} is not a full hash: "${hash}"`);
      }
    }
    if (!existsSync(join(rootDir, REPORT_DIR, row.report))) {
      fail(
        `${CANONICAL_FILES.matrix}: ${row.id} names a report that does not exist: ${row.report}`,
      );
    }
    if (row.blocking !== 'NONE') {
      fail(`${CANONICAL_FILES.matrix}: ${row.id} is blocking: "${row.blocking}"`);
    }
  }
  const e01 = rows.find((row) => row.id === 'APP2-E01');
  if (e01 === undefined) {
    fail(`${CANONICAL_FILES.matrix}: APP2-E01 has no row`);
  } else if (e01.status !== EXPECTED.e01Status) {
    fail(
      `${CANONICAL_FILES.matrix}: APP2-E01 must be "${EXPECTED.e01Status}", got "${e01.status}"`,
    );
  }
}

function checkForbidden(rootDir, matrix, fail) {
  const rows = checkpointRows(matrix);
  for (const id of FORBIDDEN_CHECKPOINTS) {
    if (rows.some((row) => row.id === id)) {
      fail(`${CANONICAL_FILES.matrix}: ${id} must not exist, but has a checkpoint row`);
    }
    const reports = readdirSync(join(rootDir, REPORT_DIR)).filter((file) =>
      file.startsWith(`${id}-`),
    );
    for (const report of reports) {
      fail(`${REPORT_DIR}/${report}: ${id} must not exist, but has a report`);
    }
  }
}

function checkFollowUps(matrix, fail) {
  const rows = followUpRows(matrix);
  if (rows.length === 0) {
    fail(`${CANONICAL_FILES.matrix}: the follow-up register is empty`);
  }
  for (const row of rows) {
    if (row.blocking !== 'NONBLOCKING') {
      fail(`${CANONICAL_FILES.matrix}: ${row.id} is "${row.blocking}"; closure needs NONBLOCKING`);
    }
    for (const [label, value] of [
      ['owner', row.owner],
      ['target', row.target],
      ['reason', row.reason],
      ['source', row.source],
      ['status', row.status],
    ]) {
      if (value === '' || value === '—' || value === 'TBD') {
        fail(`${CANONICAL_FILES.matrix}: ${row.id} has no ${label}`);
      }
    }
  }
}

function checkVerdict(matrix, roadmap, fail) {
  for (const [key, text] of [
    ['matrix', matrix],
    ['roadmap', roadmap],
  ]) {
    if (!text.includes(EXPECTED.phaseVerdict)) {
      fail(`${CANONICAL_FILES[key]}: the APP2 verdict "${EXPECTED.phaseVerdict}" is missing`);
    }
  }
}

function checkSurface(matrix, phase, roadmap, fail) {
  // Scoped to the authoritative row. A bare document-wide search would be
  // satisfied by any historical mention of the route, which is exactly the
  // sentence that survives when the current surface is the thing that moved.
  const routeRow = matrix.split('\n').find((line) => line.startsWith('| Public routes |')) ?? '';
  for (const route of EXPECTED.routes) {
    if (!routeRow.includes(route)) {
      fail(
        `${CANONICAL_FILES.matrix}: public route ${route} is missing from the Public routes row`,
      );
    }
  }
  for (const operation of EXPECTED.operations) {
    if (!matrix.includes(operation)) {
      fail(`${CANONICAL_FILES.matrix}: public operation ${operation} is missing`);
    }
  }
  if (!matrix.includes(EXPECTED.notFoundAuthority)) {
    fail(`${CANONICAL_FILES.matrix}: ${EXPECTED.notFoundAuthority} is no longer recorded`);
  }
  for (const [key, text] of [
    ['matrix', matrix],
    ['phase', phase],
    ['roadmap', roadmap],
  ]) {
    for (const line of falseNotFoundClaims(text)) {
      fail(
        `${CANONICAL_FILES[key]}: calls the streamed not-found an exact 404:\n    ${line.trim().slice(0, 180)}`,
      );
    }
    for (const line of dispatchedPublicationClaims(text)) {
      fail(
        `${CANONICAL_FILES[key]}: claims publication events were dispatched or consumed:\n    ${line.trim().slice(0, 180)}`,
      );
    }
  }
}

/**
 * The one `APP3-` report that is not APP3 engineering: a docs-only audit of the
 * closed baseline post-dates closure. Exact filename, never a prefix or label
 * escape — every other `APP3-` report still fails. Closure verdict unchanged.
 */
const NEXT_PHASE_AUDIT_REPORT = 'APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md';

function checkNextPhase(rootDir, matrix, roadmap, fail) {
  const started = readdirSync(join(rootDir, REPORT_DIR)).filter(
    (file) => file.startsWith(`${EXPECTED.nextPhase}-`) && file !== NEXT_PHASE_AUDIT_REPORT,
  );
  for (const report of started) {
    fail(`${REPORT_DIR}/${report}: ${EXPECTED.nextPhase} must not be started before closure`);
  }
  if (!matrix.includes(`${EXPECTED.nextPhase} `) || !matrix.includes('NOT STARTED')) {
    fail(`${CANONICAL_FILES.matrix}: does not record ${EXPECTED.nextPhase} as READY — NOT STARTED`);
  }
  if (!roadmap.includes('NOT_STARTED')) {
    fail(`${CANONICAL_FILES.roadmap}: no phase remains NOT_STARTED; the next phase started early`);
  }
}

async function main() {
  const failures = await checkApp2Closure();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app2-closure — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  const rows = checkpointRows(readFileSync(join(REPO_ROOT, CANONICAL_FILES.matrix), 'utf8'));
  const followUps = followUpRows(readFileSync(join(REPO_ROOT, CANONICAL_FILES.matrix), 'utf8'));
  console.log(
    `check:app2-closure — APP2 ${EXPECTED.phaseVerdict} (${rows.length} checkpoint rows, ` +
      `${followUps.length} routed follow-ups, 0 blocking; OpenAPI ${String(EXPECTED.openapiPaths)}/` +
      `${String(EXPECTED.openapiOperations)}/${String(EXPECTED.openapiSchemas)}, ` +
      `${String(EXPECTED.migrations)} migrations, Figma owned ` +
      `${String(EXPECTED.figmaOwnedRows)} rows/${String(EXPECTED.figmaOwnedTables)} tables intact, ` +
      `${EXPECTED.notFoundAuthority} current, ${EXPECTED.nextPhase} NOT STARTED)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
