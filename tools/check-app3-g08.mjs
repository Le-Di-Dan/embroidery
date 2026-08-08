#!/usr/bin/env node
/**
 * `APP3-G08` — Design Session upload architecture and authorization staging.
 *
 * `APP3-B06` stopped at `BLOCKED — ENTRY_ARCHITECTURE_PRESUPPOSITION_ABSENT`
 * because its plan presupposed a server upload-intent operation, a browser
 * presign capability and an upload-completion proof, none of which exist here.
 * `IMP-D048` selects the architecture that does exist, and this gate keeps the
 * selection honest.
 *
 * The failure mode it is built against is the *convenient* one. Adding a presign
 * method, a second upload-token architecture, a polling loop or a cron sweep
 * would each make `APP3-B06B` easy to write, and each would silently undo the
 * reason G08 exists. So the negations are asserted as hard as the rulings.
 *
 * Two of the checks matter more than the rest. The bootstrap owner is verified
 * against the real checkpoint table rather than the ruling's prose, because a
 * second issuer of the same session credential is exactly what a "bounded
 * assignment" would have created. And the ordering route is verified as a
 * *route* — `APP3-W01C` must be ahead of `APP3-B06B` in the dependency table —
 * because the defect it fixes is one where the wrong answer is silence.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-g08.mjs [rootDir]
 */
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_FILES,
  DECISION_ID,
  checkBootstrapOwner,
  checkNoImplementation,
  checkOrderingPremise,
  checkRulingSubstance,
  checkStoragePortUnchanged,
  read,
} from './check-app3-g08-architecture.mjs';
import { checkApp3G03 } from './check-app3-g03.mjs';
import { checkApp3G06 } from './check-app3-g06.mjs';
import { checkApp3P03 } from './check-app3-p03.mjs';
import { checkApp3W01A } from './check-app3-w01a.mjs';
import { checkApp3W01B } from './check-app3-w01b.mjs';
import { acceptedSurface } from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export { CANONICAL_FILES, DECISION_ID, read } from './check-app3-g08-architecture.mjs';

/** The §6.22.1 facts, recomputed from the bounded table. */
export const EXPECTED_FACTS = Object.freeze({
  'Server upload-intent operation': 'NONE',
  'Upload-completion proof operation': 'NONE',
  'ObjectStoragePort presign method': 'NONE',
  'ObjectStoragePort method count': '6',
  'Delivered APP2 upload architecture': 'API_OWNED_MULTIPART_STREAMING',
  'Delivered upload durable steps': 'TX_A_UPLOADED_THEN_TX_B_INSPECTING',
  'Admin upload-intent module': 'BROWSER_STATE_MACHINE_ONLY',
  'Session cookie verifier in API': 'NONE',
  'DesignModule in AppModule': 'ABSENT',
  'Session association writer result': 'VOID',
  'Session asset lane': 'CUSTOMER_UPLOAD + CUSTOMER_PRIVATE',
  'Session asset lane migration': 'NONE',
  'Session bootstrap owner': 'APP3-B07',
  'Normalization required asset status': 'ACCEPTED',
  'Normalization verdict while INSPECTING': 'TERMINAL_NON_RETRYABLE',
});

/** Dependency statuses this gate reconciles (§6.22.5). */
export const EXPECTED_DEPENDENCIES = Object.freeze({
  'APP3-G08 :: whole checkpoint': 'COMPLETE — REVIEW_DELIVERED',
  'APP3-B06 :: first attempt, post-G08': 'BLOCKED — ENTRY_ARCHITECTURE_PRESUPPOSITION_ABSENT',
  'APP3-B06 :: disposition, post-G08': 'REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B',
  'APP3-B06A :: whole checkpoint, post-G08': 'BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE',
  'APP3-W01C :: whole checkpoint, post-G08': 'BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE',
  'APP3-B06B :: whole checkpoint, post-G08': 'BLOCKED_BY_APP3-B06A_APP3-W01C_AND_APP3-B07',
  'APP3-B07 :: whole checkpoint, post-G08': 'READY — NOT STARTED',
  'APP3-B03 :: whole checkpoint, post-G08': 'READY — NOT STARTED',
  'APP3-S06 :: whole checkpoint, post-G08': 'BLOCKED_BY_APP3-B06B_AND_APP3-D01',
  'APP3-P03 :: whole checkpoint, post-G08': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-W01A :: whole checkpoint, post-G08': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-W01B :: whole checkpoint, post-G08': 'COMPLETE — REVIEW_ACCEPTED',
});

/** Status lines the ruling requires in every world. */
export const EXPECTED_STATUS = Object.freeze([
  // The phase-level token names whatever the newest checkpoint delivered, so
  // pinning it here would make every later checkpoint edit this gate.
  /\nAPP3 = IN PROGRESS — [A-Z0-9_]+\n/,
  'IMP-D048 = LOCKED',
  'APP3-B06 = REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B',
  'APP3-B06 FIRST_ATTEMPT = BLOCKED — ENTRY_ARCHITECTURE_PRESUPPOSITION_ABSENT',
  'APP3-P03 = COMPLETE — REVIEW_ACCEPTED',
  'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE — CLOSED_BY_APP3-P03',
  'FU-PLATFORM-ZOD-DTO-OPENAPI-PARAMETERS-01 = OPEN — NONBLOCKING_EXISTING_SURFACE_CLEANUP',
  'SESSION_UPLOAD_ARCHITECTURE = API_OWNED_MULTIPART_STREAMING',
  'SESSION_UPLOAD_PRESIGN = NONE',
  'SESSION_BOOTSTRAP_OWNER = APP3-B07',
  'APP3-B06B EXPECTED_SURFACE = PATHS_20_OPERATIONS_24',
  'INSPECTION_NORMALIZATION_ORDERING = NOT_PROVABLE_ROUTED_TO_APP3-W01C',
  'APP3-B03 = READY — NOT STARTED',
]);

/**
 * The two worlds this ruling's own successors put the phase in.
 *
 * G08 was the frontier when it ran, so it recorded its successors as blocked on
 * its acceptance. `APP3-W01C` then carried out the PO-08 route, and a gate that
 * still demanded the blocked form would have to be deleted the day its own
 * ruling was executed. Exactly two consistent sets are accepted, and every
 * mixture fails.
 */
export const STATUS_BEFORE_W01C = Object.freeze([
  'APP3-G08 = COMPLETE — REVIEW_DELIVERED',
  'APP3-B06A = BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE',
  'APP3-W01C = BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE',
  'APP3-B06B = BLOCKED_BY_APP3-B06A_APP3-W01C_AND_APP3-B07',
]);

export const STATUS_AFTER_W01C = Object.freeze([
  'APP3-G08 = COMPLETE — REVIEW_ACCEPTED',
  // These move again as their own checkpoints are accepted and delivered. What
  // G08 rules is that W01C is *done*, that B07 owns bootstrap and that B06B
  // waits on B06A and B07 — not which review stage each line happens to be at,
  // which is a fact about the calendar rather than about the architecture.
  /\nAPP3-W01C = COMPLETE — REVIEW_(DELIVERED|ACCEPTED)\n/,
  /\nAPP3-B07 = (READY — NOT STARTED|COMPLETE — REVIEW_(DELIVERED|ACCEPTED))\n/,
  /\nAPP3-B06A = (READY — NOT STARTED|COMPLETE — REVIEW_(DELIVERED|ACCEPTED))\n/,
  // …and finally delivered, then corrected. G08 ruled B06B's architecture; a
  // gate that only ever accepted the blocked or ready form would fail the day
  // its own ruling shipped — and one that stopped at the first delivered form
  // fails the day that delivery is corrected, which is what `APP3-B06B-C1` did.
  // The review stage is still calendar, not architecture; what stays ruled is
  // that B06B is one of the states G08 defined for it.
  /\nAPP3-B06B = (BLOCKED_BY_APP3-(B06A_AND_)?B07|READY — NOT STARTED|COMPLETE — REVIEW_DELIVERED(_AFTER_C1)?)\n/,
]);

/** An expected status entry: an exact line, or a pattern over the block. */
function statusMatches(status, entry) {
  return entry instanceof RegExp ? entry.test(status) : status.includes(`\n${entry}\n`);
}

const RULINGS = Object.freeze([
  'PO-01',
  'PO-02',
  'PO-03',
  'PO-04',
  'PO-05',
  'PO-06',
  'PO-07',
  'PO-08',
  'PO-09',
]);

const ROOT_SCRIPT_COUNT = 30;
const SOFT_CAP_CHECKER = 450;
const SOFT_CAP_TEST = 700;

/** The body of one `### x.y.z ` section, up to the next heading of any depth. */
export function sectionBody(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n#{2,4} /);
  return end < 0 ? rest : rest.slice(0, end);
}

export function factTable(phaseText) {
  return new Map(
    sectionBody(phaseText, '### 6.22.1 ')
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

export function dependencyTable(phaseText) {
  return new Map(
    sectionBody(phaseText, '### 6.22.5 ')
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [`${m[1]} :: ${m[2]}`, m[3]]),
  );
}

/** The fenced `## 10. Status` block, which is the only place statuses count. */
export function statusBlock(phaseText) {
  const marker = phaseText.indexOf('## 10. Status');
  if (marker < 0) return '';
  const open = phaseText.indexOf('```text', marker);
  if (open < 0) return '';
  const close = phaseText.indexOf('```', open + 7);
  return close < 0 ? '' : phaseText.slice(open + 7, close);
}

/** 1 — the decision exists exactly once, is LOCKED and carries every ruling. */
export function checkDecision(register, fail) {
  const rows = register.split('\n').filter((line) => line.startsWith(`| ${DECISION_ID} |`));
  if (rows.length === 0) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is missing`);
    return;
  }
  if (rows.length > 1) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is declared ${String(rows.length)} times`);
    return;
  }
  const row = rows[0];
  for (const ruling of RULINGS) {
    if (!row.includes(`(${ruling})`)) {
      fail(`${CANONICAL_FILES.register}: ${DECISION_ID} does not record ruling ${ruling}`);
    }
  }
  if (!row.trimEnd().endsWith('| LOCKED |')) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is not LOCKED`);
  }
  return row;
}

/** Every row of `expected` a parsed table fails to match, by exact string. */
function checkTable(rows, expected, what, fail) {
  for (const [key, value] of Object.entries(expected)) {
    const actual = rows.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: ${what} \`${key}\` is missing`);
    } else if (actual !== value) {
      fail(`${CANONICAL_FILES.phase}: \`${key}\` is "${actual}", expected "${value}"`);
    }
  }
}

/** 19, 20 — the parameter follow-up stays open and the root stays at 30 scripts. */
export function checkGovernance(rootDir, status, fail) {
  if (!/FU-PLATFORM-ZOD-DTO-OPENAPI-PARAMETERS-01 = OPEN/.test(status)) {
    fail(`${CANONICAL_FILES.phase}: the parameter follow-up is not recorded open`);
  }
  const manifest = read(rootDir, 'rootManifest');
  if (manifest === undefined) {
    fail('package.json: missing');
    return;
  }
  const scripts = Object.keys(JSON.parse(manifest).scripts ?? {});
  if (scripts.length !== ROOT_SCRIPT_COUNT) {
    fail(`package.json: ${String(scripts.length)} root scripts, expected ${ROOT_SCRIPT_COUNT}`);
  }
  if (scripts.some((name) => name.includes('g08'))) {
    fail('package.json: APP3-G08 added a root script');
  }
  const index = read(rootDir, 'commandIndex') ?? '';
  for (const id of ['CMD-CHECK-APP3-G08', 'CMD-TEST-APP3-G08']) {
    if (!index.includes(`\`${id}\``)) {
      fail(`${CANONICAL_FILES.commandIndex}: ${id} is not indexed`);
    }
  }
}

/** 21, 22 — the checkpoint records its execution governance and its ledger. */
function checkExecutionEvidence(rootDir, fail) {
  const report = read(rootDir, 'report');
  if (report === undefined) {
    return; // Commit A runs before the report exists.
  }
  for (const [needle, what] of [
    [' command ledger', 'the command ledger'],
    ['REUSED_RESULT_FROM', 'the reused-result evidence'],
  ]) {
    if (!new RegExp(needle, 'i').test(report)) {
      fail(`${CANONICAL_FILES.report}: does not record ${what}`);
    }
  }
}

/** Tooling soft caps (`VALIDATION_GOVERNANCE.md` §5.1). */
export function checkFileSizes(rootDir, fail) {
  for (const [file, cap] of [
    ['tools/check-app3-g08.mjs', SOFT_CAP_CHECKER],
    ['tools/check-app3-g08-architecture.mjs', SOFT_CAP_CHECKER],
    ['tools/check-app3-g08.test.mjs', SOFT_CAP_TEST],
  ]) {
    const text = read(rootDir, file);
    if (text === undefined) {
      fail(`${file}: missing`);
      continue;
    }
    const lines = text.split('\n').length;
    if (lines > cap) {
      fail(`${file}: ${String(lines)} lines, above the ${String(cap)} soft cap`);
    }
  }
}

/** 18 — the accepted predecessors still pass. */
function checkPredecessors(rootDir, fail) {
  for (const [label, run] of [
    ['APP3-P03', checkApp3P03],
    ['APP3-G03', checkApp3G03],
    ['APP3-G06', checkApp3G06],
    ['APP3-W01A', checkApp3W01A],
    ['APP3-W01B', checkApp3W01B],
  ]) {
    const result = run(rootDir);
    for (const violation of Array.isArray(result) ? result : (result.failures ?? [])) {
      fail(`${label} regression: ${violation}`);
    }
  }
}

export function checkApp3G08(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const phase = read(rootDir, 'phase');
  const register = read(rootDir, 'register');
  if (phase === undefined || register === undefined) {
    fail('the canonical phase plan or decision register is missing');
    return failures;
  }

  const row = checkDecision(register, fail);
  if (row !== undefined) checkRulingSubstance(row, fail);

  checkTable(factTable(phase), EXPECTED_FACTS, 'fact', fail);
  checkTable(dependencyTable(phase), EXPECTED_DEPENDENCIES, 'dependency', fail);

  const status = statusBlock(phase);
  const afterW01C = /\nAPP3-W01C = COMPLETE/.test(status);
  for (const entry of [
    ...EXPECTED_STATUS,
    ...(afterW01C ? STATUS_AFTER_W01C : STATUS_BEFORE_W01C),
  ]) {
    if (!statusMatches(status, entry)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${String(entry)}"`);
    }
  }
  // No mixture: a line from the world this phase is not in is a contradiction.
  for (const entry of afterW01C ? STATUS_BEFORE_W01C : STATUS_AFTER_W01C) {
    if (statusMatches(status, entry)) {
      fail(
        `${CANONICAL_FILES.phase}: status block still records the superseded "${String(entry)}"`,
      );
    }
  }

  checkBootstrapOwner(phase, fail);
  checkOrderingPremise(rootDir, fail);
  checkStoragePortUnchanged(rootDir, fail);
  checkNoImplementation(rootDir, status, fail);
  checkGovernance(rootDir, status, fail);
  checkExecutionEvidence(rootDir, fail);
  checkFileSizes(rootDir, fail);
  checkPredecessors(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp3G08(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-g08 — ${String(failures.length)} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-g08 — the Session upload lane keeps the architecture the repository actually ' +
      'has: one API-owned multipart streaming operation, with the storage port still at exactly ' +
      'six methods and no presign, no upload-intent/completion pair and no second upload-token ' +
      'architecture; APP3-B06 is replanned rather than failed, its first attempt survives as ' +
      'evidence, and session bootstrap stays with the checkpoint that already owns it instead ' +
      'of gaining a second issuer of the same credential; the measured ordering defect — a ' +
      'not-yet-ACCEPTED Asset is a terminal normalization verdict, so two events committed ' +
      'together would strand every lost race in silence — is routed to APP3-W01C ahead of ' +
      'B06B rather than left to it; and the phase records one of exactly two consistent worlds, ' +
      'with no application, package, schema, OpenAPI or root-script change made here',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
