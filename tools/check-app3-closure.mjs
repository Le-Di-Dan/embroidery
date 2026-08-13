#!/usr/bin/env node
/**
 * The `APP3-X01` phase-closure invariants.
 *
 * A closure verdict is the easiest thing in a repository to quietly falsify: a
 * status word is one edit away from turning a blocker into a pass, an owner is
 * one deletion away from vanishing, and a frozen number copied into prose stops
 * matching the artifact the moment somebody regenerates it. This file makes the
 * APP3 closure matrix answerable to the repository instead of to itself.
 *
 * What it enforces, and why each rule is here:
 *
 * - **The closure register says exactly one thing per key.** APP3's status log
 *   grew as prose in which newer blocks were sometimes inserted above older
 *   ones; at `APP3-X01` entry the last `APP3-E01 =` line in the file still read
 *   `READY — NOT STARTED`. Ambiguity is removed rather than resolved: one
 *   fenced block, one line per key, and a duplicate is a failure.
 * - **Every executed checkpoint is in the matrix, and every matrix row has a
 *   report.** Derived from the report directory, so a checkpoint cannot be
 *   dropped from the record by being left out of a table somebody typed.
 * - **No ruled-out checkpoint exists**, and a cancelled correction is never
 *   counted as delivered.
 * - **Every open follow-up is nonblocking and concretely owned.**
 *   `PASS_WITH_FOLLOW_UPS` is a real verdict only while that holds; an
 *   ownerless or blocking follow-up is a blocker wearing a different word.
 * - **Debt still names its own numbers**, and capabilities APP3 did not deliver
 *   are recorded as not delivered — including group creation, which an
 *   authority deferred and no checkpoint may claim.
 * - **Frozen artifacts are recomputed, never trusted.**
 * - **APP4 has not started.**
 *
 * Docker-free, network-free, database-free.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { measureFrozenArtifacts } from './check-app2-closure-artifacts.mjs';
import { checkArtifacts } from './check-app3-closure-artifacts.mjs';
import {
  CANONICAL_FILES,
  CAPABILITIES,
  CLOSURE_CHECKPOINT,
  EMPTY_OWNERS,
  FORBIDDEN_CHECKPOINTS,
  NOT_DELIVERED,
  OPEN_FOLLOW_UPS,
  REGISTER,
  REGISTER_HEADING,
  REPORT_DIR,
  REPO_ROOT,
  TRANSFORM_DEBT,
  VERDICTS,
} from './check-app3-closure.sources.mjs';

/** A pipe escaped inside a Markdown cell, and a character no cell contains. */
const ESCAPED_PIPE = String.raw`\|`;
const SENTINEL = String.fromCharCode(1);

const read = (root, key) => {
  const path = join(root, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
};

/** Report basenames on disk for a phase, e.g. `APP3-S10-COMPLETION-REPORT.md`. */
function reportsFor(root, phase) {
  const dir = join(root, REPORT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.startsWith(`${phase}-`) && name.endsWith('.md'));
}

/** The checkpoint id a completion report belongs to, or undefined. */
function checkpointOf(name) {
  const match = /^(APP3-.+)-COMPLETION-REPORT\.md$/.exec(name);
  return match?.[1];
}

/**
 * The fenced closure register, as `key -> [line, ...]`.
 *
 * Collected as a list per key on purpose: a duplicate must be reportable, not
 * silently resolved by keeping the first or the last.
 */
export function parseRegister(phaseText) {
  const afterHeading = phaseText.split(REGISTER_HEADING)[1];
  if (afterHeading === undefined) return undefined;
  const fence = /```text\n([\s\S]*?)```/.exec(afterHeading);
  if (fence === null) return undefined;
  const entries = new Map();
  for (const row of fence[1].split('\n')) {
    const match = /^([A-Z0-9][A-Z0-9-]*) = (.+)$/.exec(row.trim());
    if (match === null) continue;
    if (!entries.has(match[1])) entries.set(match[1], []);
    entries.get(match[1]).push(match[2].trim());
  }
  return entries;
}

/** One fenced block, one line per key, each carrying the accepted word. */
export function checkRegister(root, fail) {
  const phase = read(root, 'phase');
  if (phase === undefined) return fail('the APP3 phase plan is missing');
  const entries = parseRegister(phase);
  if (entries === undefined) {
    return fail(`the phase plan has no fenced "${REGISTER_HEADING}" block`);
  }
  for (const [key, expected] of Object.entries(REGISTER)) {
    const lines = entries.get(key) ?? [];
    if (lines.length === 0) {
      fail(`closure register: ${key} is missing`);
      continue;
    }
    if (lines.length > 1) {
      fail(
        `closure register: ${key} appears ${lines.length} times — the current word is ambiguous`,
      );
      continue;
    }
    if (lines[0] !== expected) {
      fail(`closure register: ${key} = "${lines[0]}", expected "${expected}"`);
    }
  }
  // The register is the current word; a blocking restatement of the repaired
  // seam anywhere inside it reopens the finding whatever the line above says.
  const seam = entries.get('FU-APP3-UPLOAD-REVISION-SEAM-01')?.join(' ') ?? '';
  if (/BLOCKS_X01/.test(seam)) {
    fail('closure register: the upload-revision finding is blocking again');
  }
}

/**
 * Matrix rows, split into cells, for a table whose first cell matches `first`.
 *
 * `\|` is an escaped pipe inside a cell — a TypeScript union written in prose
 * is the common case — and splitting on it would silently shift every later
 * cell of that row into the wrong column.
 */
function rowsOf(matrixText, first) {
  return matrixText
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .replaceAll(ESCAPED_PIPE, SENTINEL)
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim().replaceAll(SENTINEL, '|')),
    )
    .filter((cells) => cells.length > 1 && first.test(cells[0]));
}

/** Every executed checkpoint is recorded, and every record has its report. */
export function checkCheckpoints(root, fail) {
  const matrix = read(root, 'matrix');
  if (matrix === undefined) return fail('the APP3 closure matrix is missing');

  const rows = rowsOf(matrix, /^\d+$/);
  const recorded = new Map(rows.map((cells) => [cells[1].replaceAll('`', ''), cells]));
  // The closure checkpoint is excluded from its own accepted table by
  // construction: it is not accepted — it is delivered for the review that
  // decides — and its second commit is the one that adds the report being read
  // here. It must still be recorded, as an explicitly unaccepted row, below.
  const onDisk = reportsFor(root, 'APP3')
    .map(checkpointOf)
    .filter((id) => id !== undefined && id !== CLOSURE_CHECKPOINT);

  for (const id of onDisk) {
    if (!recorded.has(id)) {
      fail(`${id} has a completion report but no closure-matrix row`);
    }
  }
  if (!new RegExp(`\`${CLOSURE_CHECKPOINT}\`[^\\n]*DELIVERED_FOR_REVIEW`).test(matrix)) {
    fail(`the closure matrix does not record ${CLOSURE_CHECKPOINT} as delivered for review`);
  }
  for (const [id, cells] of recorded) {
    if (!onDisk.includes(id)) {
      fail(`closure matrix row ${id} has no completion report on disk`);
    }
    const [, , , status, accepted, implementation, evidence] = cells;
    if (!/^`COMPLETE/.test(status)) {
      fail(`${id} is recorded as ${status}, which is not a final accepted status`);
    }
    if (accepted !== 'yes') {
      fail(`${id} is recorded as not accepted`);
    }
    for (const [label, value] of [
      ['implementation', implementation],
      ['evidence', evidence],
    ]) {
      if (!/^`[0-9a-f]{7,40}`$/.test(value ?? '')) {
        fail(`${id} records no real ${label} commit (${String(value)})`);
      }
    }
  }
  if (recorded.size === 0) {
    fail('the closure matrix records no checkpoints at all');
  }
}

/** Nothing ruled out exists, and nothing cancelled is counted as delivered. */
export function checkForbidden(root, fail) {
  const matrix = read(root, 'matrix') ?? '';
  const delivered = new Set(rowsOf(matrix, /^\d+$/).map((cells) => cells[1].replaceAll('`', '')));
  for (const id of FORBIDDEN_CHECKPOINTS) {
    if (existsSync(join(root, REPORT_DIR, `${id}-COMPLETION-REPORT.md`))) {
      fail(`${id} was ruled out but has a completion report on disk`);
    }
    if (delivered.has(id)) {
      fail(`${id} was ruled out but is counted as a delivered checkpoint`);
    }
  }
  if (!/cancelled/i.test(matrix) || !matrix.includes('APP3-B06C-C1')) {
    fail('the closure matrix does not reconcile the cancelled APP3-B06C-C1 correction');
  }
}

/** Every open follow-up: named, nonblocking, and owned by something concrete. */
export function checkFollowUps(root, fail) {
  const matrix = read(root, 'matrix');
  if (matrix === undefined) return;

  const rows = rowsOf(matrix, /^`FU-APP3-/);
  const recorded = new Map(rows.map((cells) => [cells[0].replaceAll('`', ''), cells]));

  for (const [id, owner] of Object.entries(OPEN_FOLLOW_UPS)) {
    const cells = recorded.get(id);
    if (cells === undefined) {
      fail(`${id} is open but has no closure-matrix row`);
      continue;
    }
    const [, description, origin, klass, recordedOwner, activation] = cells;
    for (const [label, value] of [
      ['description', description],
      ['origin', origin],
      ['class', klass],
      ['owner', recordedOwner],
      ['activation condition', activation],
    ]) {
      if (!value) fail(`${id} records no ${label}`);
    }
    if (recordedOwner !== undefined && !recordedOwner.includes(owner)) {
      fail(`${id} is owned by "${recordedOwner}", expected ${owner}`);
    }
    for (const empty of EMPTY_OWNERS) {
      if (recordedOwner?.includes(empty)) {
        fail(`${id} defers its owner ("${empty}") instead of naming one`);
      }
    }
    if (/BLOCKS_X01|blocking/i.test(`${klass ?? ''}`) && !/nonblocking/i.test(`${klass ?? ''}`)) {
      fail(`${id} is recorded as blocking, so APP3 cannot close`);
    }
  }

  const debt = recorded.get('FU-APP3-TRANSFORM-BUDGET-01');
  if (debt !== undefined) {
    if (!debt[3].includes(TRANSFORM_DEBT.disposition)) {
      fail('the transform budget is no longer carried as explicit accepted phase debt');
    }
    for (const figure of TRANSFORM_DEBT.figures) {
      if (!debt.join(' ').includes(figure)) {
        fail(`the transform debt no longer records its measured ${figure} figure`);
      }
    }
  }
}

/** The delivered capability baseline, and the capabilities APP3 did not deliver. */
export function checkCapabilities(root, fail) {
  const matrix = read(root, 'matrix');
  if (matrix === undefined) return;

  const delivered = new Map(
    rowsOf(matrix, /./)
      .filter((cells) => cells.length === 2)
      .map((cells) => [cells[0], cells[1]]),
  );
  for (const capability of CAPABILITIES) {
    // Prefix, so a row may cite the authority that locked it — "Native React
    // SVG renderer (`IMP-D026`)" — without the name drifting from this list.
    const key = [...delivered.keys()].find((name) => name.startsWith(capability));
    const evidence = key === undefined ? undefined : delivered.get(key);
    if (evidence === undefined) {
      fail(`the capability baseline does not record "${capability}"`);
      continue;
    }
    if (!/`APP3-[A-Z0-9-]+`/.test(evidence)) {
      fail(`"${capability}" names no delivering checkpoint`);
    }
  }
  // Scoped to the not-delivered block, not to the document. A mutation test
  // caught the looser rule staying green when "group creation" was moved into
  // the delivered column, because the words still appeared in a follow-up row
  // that mentioned them. A capability is recorded as absent in one place.
  const absentBlock = /### 6\.1[^\n]*\n[\s\S]*?```text\n([\s\S]*?)```/.exec(matrix)?.[1];
  if (absentBlock === undefined) {
    fail('the closure matrix has no "not delivered by APP3" block');
  } else {
    for (const absent of NOT_DELIVERED) {
      if (!absentBlock.includes(absent)) {
        fail(`the closure matrix does not record that "${absent}" is not delivered by APP3`);
      }
    }
  }
  if (/production[- ]ready\b/i.test(matrix.replace(/PRODUCTION_READINESS[^\n]*/g, ''))) {
    fail(
      'the closure matrix makes a production-readiness claim, which IMP-D015 reserves for APP12',
    );
  }
}

/** The verdict the matrix states, against the follow-ups it carries. */
export function checkVerdict(root, fail) {
  const matrix = read(root, 'matrix');
  if (matrix === undefined) return;
  const verdict = /APP3_VERDICT = ([A-Z_]+)/.exec(matrix)?.[1];
  if (verdict === undefined || !VERDICTS.includes(verdict)) {
    return fail(`the closure matrix states no valid verdict (${String(verdict)})`);
  }
  const open = Object.keys(OPEN_FOLLOW_UPS).length;
  if (verdict === 'PASS' && open > 0) {
    fail(`the verdict is PASS while ${open} follow-ups remain open`);
  }
  if (verdict === 'PASS_WITH_FOLLOW_UPS' && open === 0) {
    fail('the verdict is PASS_WITH_FOLLOW_UPS while no follow-up remains open');
  }
  const stated = /APP3_OPEN_FOLLOW_UPS = (\d+)/.exec(matrix)?.[1];
  if (Number(stated) !== open) {
    fail(`the matrix states ${String(stated)} open follow-ups; ${open} are required to be open`);
  }
  const blocking = /APP3_BLOCKING_FOLLOW_UPS = (\d+)/.exec(matrix)?.[1];
  if (blocking !== '0') {
    fail(`the matrix states ${String(blocking)} blocking follow-ups; closure requires 0`);
  }
}

/** APP4 has not started. */
export function checkNextPhase(root, fail) {
  const started = reportsFor(root, 'APP4');
  for (const name of started) {
    fail(`${name} exists, so APP4 has started before APP3 closed`);
  }
  const matrix = read(root, 'matrix') ?? '';
  if (!matrix.includes('APP4 = READY_FOR_PRE_IMPLEMENTATION_AUDIT')) {
    fail('the closure matrix does not hand APP4 off as ready for its pre-implementation audit');
  }
}

export { checkArtifacts };

/** Every rule except the artifact comparison, which needs a measurement. */
export function checkApp3Closure(root, fail) {
  checkRegister(root, fail);
  checkCheckpoints(root, fail);
  checkForbidden(root, fail);
  checkFollowUps(root, fail);
  checkCapabilities(root, fail);
  checkVerdict(root, fail);
  checkNextPhase(root, fail);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkApp3Closure(REPO_ROOT, fail);
  checkArtifacts(REPO_ROOT, await measureFrozenArtifacts(REPO_ROOT), fail);

  if (failures.length > 0) {
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    console.error(`APP3 closure check FAILED (${failures.length}).`);
    process.exitCode = 1;
  } else {
    console.log(
      'APP3 closure check passed: register unambiguous, every executed checkpoint recorded and ' +
        'accepted, no ruled-out checkpoint, 11 follow-ups open and owned with 0 blocking, ' +
        'capability baseline evidenced, frozen artifacts recomputed, APP4 not started.',
    );
  }
}
