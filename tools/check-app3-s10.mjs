#!/usr/bin/env node
/**
 * `APP3-S10` — the Studio autosave / conflict / resume / expiry gate.
 *
 * The ways an autosave ships looking right and being wrong:
 *
 * - **It predicts the revision.** `previous + 1` agrees with the server every
 *   time until two tabs race, and then it presents a revision nobody issued.
 * - **It replays an unknown outcome.** A PUT that timed out may already have
 *   landed; sending it again is how a stale document overwrites a good one, and
 *   nothing on screen says it happened.
 * - **It merges.** Any automatic resolution of a `409` throws away one of two
 *   documents a customer made, silently, and picks which one for them.
 * - **It retries forever.** An unbounded ladder keeps a request loop alive in a
 *   tab with no network, and the 30-per-minute Session ceiling then refuses the
 *   save that would have worked.
 * - **It saves on every keystroke.** Correct, and 3600 writes a minute against a
 *   ceiling of 30.
 * - **It keeps the document.** A durable copy makes the approved offline
 *   sentence — *"đừng đóng tab"* — a lie, and turns browser storage into a save
 *   nobody reviewed.
 * - **It keeps the secret.** The Session secret is an `HttpOnly` cookie; a hash,
 *   a copy or a `document.cookie` scan is the one thing `APP3-G03` forbids
 *   outright.
 * - **It resurrects a discarded branch.** An undo after a resume or a
 *   load-latest restores a design the customer explicitly abandoned.
 * - **It says "saved" when it is not.** A timestamp read from a clock rather
 *   than from a response is the most reassuring lie an editor can tell.
 *
 * This module rules on the predecessors, the design approval and the artifacts;
 * `check-app3-s10-runtime.mjs` rules on the loop itself.
 *
 * Read-only, cross-platform pure Node. Independent of the completion report.
 */
import { foreignApprovals, isS11Delivered } from './app3-accepted-paths.mjs';
import {
  CANONICAL_FILES,
  LATER_DESIGN_ROWS,
  REPO_ROOT,
  S10_DESIGN_ROWS,
  read,
} from './check-app3-s10.sources.mjs';
import {
  checkCadence,
  checkCommandIndex,
  checkConflict,
  checkFileSizes,
  checkImmutability,
  checkNonScope,
  checkOneInFlight,
  checkReconciliation,
  checkResumeFlow,
  checkResumeHandle,
  checkSurfaces,
} from './check-app3-s10-runtime.mjs';

export {
  checkCadence,
  checkCommandIndex,
  checkConflict,
  checkFileSizes,
  checkImmutability,
  checkNonScope,
  checkOneInFlight,
  checkReconciliation,
  checkResumeFlow,
  checkResumeHandle,
  checkSurfaces,
};

/** The predecessors an autosave loop is only meaningful on top of. */
const PREDECESSORS = [
  'APP3-P01',
  'APP3-P02',
  'APP3-P04',
  'APP3-B07',
  'APP3-B08',
  'APP3-S02',
  'APP3-S03',
  'APP3-S03-C1',
  'APP3-S05',
  'APP3-S06',
  'APP3-S06-C1',
  'APP3-S07',
  'APP3-S09',
];

/**
 * Studio capability rows that must not be recorded complete by this checkpoint.
 *
 * `APP3-S11` leaves the list world-awarely once it opens — the rule says "S10 did
 * not implement mobile touch", and that stays true once S11 implements it for
 * itself. `APP3-E01` replaces it so the guard never runs over an empty list.
 */
const LATER_ROWS = ['APP3-S11', 'APP3-E01'];

/** The statuses `APP3-S10` may legitimately be recorded under. */
const STATUS_LINES = [
  'APP3-S10 = BLOCKED_BY_APP3-S08-C1_REVIEW_ACCEPTANCE',
  'APP3-S10 = READY — NOT STARTED',
  'APP3-S10 = COMPLETE — REVIEW_DELIVERED',
  'APP3-S10 = COMPLETE — REVIEW_ACCEPTED',
];

export function isS10Delivered(rootDir) {
  return /\nAPP3-S10 = COMPLETE/.test(read(rootDir, 'phase') ?? '');
}

export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';

  for (const id of PREDECESSORS) {
    if (!phase.includes(`\n${id} = COMPLETE — REVIEW_ACCEPTED\n`)) {
      fail(`${CANONICAL_FILES.phase}: "${id} = COMPLETE — REVIEW_ACCEPTED" is not recorded`);
    }
  }
  // `APP3-S04` and `APP3-S08` carry a suffix in their own status lines — a group
  // deferral and a correction — so both are matched by prefix.
  for (const prefixed of ['APP3-S04', 'APP3-S08']) {
    if (!new RegExp(`\\n${prefixed} = COMPLETE — REVIEW_ACCEPTED`).test(phase)) {
      fail(`${CANONICAL_FILES.phase}: ${prefixed} is not recorded as accepted`);
    }
  }
  /*
   * The operator ruling this checkpoint exists under.
   *
   * Human review closed the `APP3-S08` correction lineage and moved any residual
   * shell work here. Both halves are asserted: no further S08 checkpoint may be
   * invented, and the ownership transfer has to stay on the record — otherwise a
   * later run could reopen S08 and call it a correction.
   */
  if (!/\nS08_CARRY_FORWARD_RECONCILIATION_OWNER = APP3-S10/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: the S08 carry-forward owner is not recorded`);
  }
  for (const invented of ['APP3-S08-C2', 'APP3-S08-MI01', 'APP3-S10-C1']) {
    if (phase.includes(`\n${invented} =`)) {
      fail(`${CANONICAL_FILES.phase}: ${invented} was created against the operator ruling`);
    }
  }
  if (!STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S10 is not recorded under a legitimate status`);
  }
  for (const later of LATER_ROWS.filter(
    (row) => !(row === 'APP3-S11' && isS11Delivered(rootDir)),
  )) {
    if (new RegExp(`\\n${later} = COMPLETE`).test(phase)) {
      fail(
        `${CANONICAL_FILES.phase}: ${later} is recorded complete by a checkpoint that is not it`,
      );
    }
  }
  // The cadence and the UI both belong here. A roadmap that moved either back to
  // `APP3-S11` would make the value in this checkpoint's own source unauthorized.
  for (const owner of ['AUTOSAVE_UI_OWNER = APP3-S10', 'AUTOSAVE_CADENCE_OWNER = APP3-S10']) {
    if (!phase.includes(`\n${owner}`)) {
      fail(`${CANONICAL_FILES.phase}: "${owner}" is not recorded`);
    }
  }
  if (!/\nMOBILE_TOUCH_OWNER = APP3-S11/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: the mobile and touch owner is no longer APP3-S11`);
  }

  if (!isS10Delivered(rootDir)) return;
  /*
   * The facts a reader cannot recompute from the source.
   *
   * The cadence ruling is the one that matters most: nothing in the code says
   * "2500 ms was chosen against a 30-per-minute Session ceiling and a
   * one-in-flight rule" — a reader would see two constants and assume taste — so
   * the status carries the reasoning, and this rule is what stops it being
   * dropped when someone later decides a shorter debounce would feel snappier.
   */
  for (const line of [
    'APP3-S10 CADENCE = 2500_MS_QUIET_UNDER_A_10000_MS_CEILING',
    'APP3-S10 IN_FLIGHT = ONE',
    'APP3-S10 REVISION = SERVER_ONLY',
    'APP3-S10 CONFLICT = TWO_CHOICES_NO_MERGE',
    'APP3-S10 AMBIGUOUS = RECONCILE_BEFORE_REPLAY',
    'APP3-S10 RETRY = BOUNDED_5000_15000_THEN_ERROR_PAUSED',
    'APP3-S10 RESUME_HANDLE = NON_SECRET_SESSION_ID_ONLY',
    'APP3-S10 RESUMED_SCOPE = PUBLIC_PLACEMENT_MANIFEST_FOR_THE_HANDLE_NAMESPACE',
    'APP3-S10 EXPIRY = SERVER_AUTHORITY_NO_RECOVERY',
    'APP3-S10 HISTORY = RESET_ONLY_ON_BRANCH_REPLACEMENT',
    'APP3-S10 SHELL = ONE_TOPBAR_ONE_RAIL_ONE_DRAWER_ONE_STAGE',
    'APP3-S10 STATE_SURFACE_PLACEMENT = UNDER_THE_TOPBAR_AT_EVERY_TIER',
    'APP3-S10 MOBILE = TRUTHFUL_STATE_ONLY_AT_390',
    'APP3-S10 MIGRATION = NONE',
    'APP3-S10 DEPENDENCY = NONE',
  ]) {
    if (!phase.includes(`\n${line}`)) {
      fail(`${CANONICAL_FILES.phase}: "${line}" is not recorded`);
    }
  }
}

/** Exactly the six section-14 rows, approved, and nothing else released. */
export function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry') ?? '';
  const rowOf = (id) => registry.split('\n').find((line) => line.startsWith(`| ${id} |`));

  for (const [id, node] of Object.entries(S10_DESIGN_ROWS)) {
    const row = rowOf(id);
    if (row === undefined) {
      fail(`${CANONICAL_FILES.registry}: ${id} is not in the registry`);
      continue;
    }
    if (!row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${CANONICAL_FILES.registry}: ${id} is not approved for implementation`);
    }
    if (!row.includes(`| ${node} |`)) {
      fail(`${CANONICAL_FILES.registry}: ${id} does not resolve to node ${node}`);
    }
    if (!row.includes('APP3-S10')) {
      fail(`${CANONICAL_FILES.registry}: ${id} carries no APP3-S10 approval evidence`);
    }
  }

  // The tablet reference stays D01-C1's. A reference re-attributed to a
  // checkpoint becomes a licence for every capability drawn on it.
  const tablet = rowOf('FIG-STUDIO-EDITING-TABLET-1024');
  if (tablet !== undefined && tablet.includes('APP3-S10')) {
    fail(`${CANONICAL_FILES.registry}: the 1024 reference was re-attributed to APP3-S10`);
  }

  /*
   * Every `APP3-S11` row stays unapproved — until S11 itself opens.
   *
   * The rule was written to stop this checkpoint starting the mobile capability,
   * and it still says exactly that: what changes is that a row released by the
   * checkpoint that owns it is no longer evidence about this one.
   *
   * The handoff annotation is never excluded, whatever ships. No Studio
   * capability checkpoint consumes it, so a blanket approval still moves it and
   * this rule still catches one — which is what stops the loop emptying itself
   * the moment section 15 was released.
   */
  const mobileOpened = isS11Delivered(rootDir);
  for (const later of LATER_DESIGN_ROWS.filter(
    (row) => !(mobileOpened && row.startsWith('FIG-STUDIO-MOBILE')),
  )) {
    const row = rowOf(later);
    if (row !== undefined && row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${CANONICAL_FILES.registry}: ${later} belongs to a later checkpoint and is approved`);
    }
  }

  /*
   * The guard that does not empty itself.
   *
   * A blanket approval was never really "a later row is approved". It is "a row
   * was released by a checkpoint that did not own it", and that stays checkable
   * forever: this checkpoint may be the approval evidence for its own six rows
   * and for no others.
   */
  for (const claimed of foreignApprovals(registry, 'APP3-S10', Object.keys(S10_DESIGN_ROWS))) {
    fail(`${CANONICAL_FILES.registry}: ${claimed} was approved as APP3-S10 evidence`);
  }
}

export function checkApp3S10(rootDir, fail) {
  checkPredecessors(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkFileSizes(rootDir, fail);
  checkImmutability(rootDir, fail);

  // The runtime rules read this checkpoint's own source, so running them before
  // it ships would rule on something that does not exist.
  if (isS10Delivered(rootDir)) {
    checkCadence(rootDir, fail);
    checkOneInFlight(rootDir, fail);
    checkReconciliation(rootDir, fail);
    checkConflict(rootDir, fail);
    checkResumeHandle(rootDir, fail);
    checkResumeFlow(rootDir, fail);
    checkSurfaces(rootDir, fail);
    checkNonScope(rootDir, fail);
  }
}

const HEADLINE =
  'check:app3-s10 — Studio autosave, conflict, resume and expiry over the accepted APP3-B08 write, ' +
  'on exactly the six approved section-14 rows with every APP3-S11 mobile row still unapproved: a ' +
  'cadence of 2500 ms of quiet under a 10000 ms ceiling measured from the first dirty mutation, so ' +
  'a continuously edited document cannot postpone its own save and the worst case is six writes a ' +
  'minute against a Session ceiling of thirty; exactly one request in flight, no setInterval, no ' +
  'polling, no background sync, no service worker and no save fired from page unload; every ' +
  'expectedRevision a revision the client read from a response, with previous + 1 unrepresentable ' +
  'anywhere in the feature; a save answering for the document it was given, so a response that lost ' +
  'a race never overwrites a newer local edit and the canonical form it returns is adopted through a ' +
  'seam that records no history entry; a 409 and a response-less outcome both reading the latest ' +
  'Session state once before anything is decided, with no blind replay in any path and an unmoved ' +
  'revision read as "nothing was written"; exactly the two conflict choices 610:118 authorizes, ' +
  'where loading the latest replaces the branch and the past that described it and keeping the local ' +
  'one preserves both and saves once against the revision the server actually holds, with no merge, ' +
  'no third button and no automatic resolution; a bounded [5000, 15000] retry ladder that stops, and ' +
  'a dismissal that hides the message and never the truth; browser storage touched by exactly one ' +
  'file, holding the non-secret Session id under a key carrying the whole placement, validated on ' +
  'the way out and never a document, a revision, an expiry or a secret; a resume offered rather than ' +
  'taken, an expiry that clears its own handle and promises no recovery, no TTL extended from the ' +
  'browser and no cookie read; one topbar, one save chip with a word for every state and a time only ' +
  'from a real successful save, one always-visible decision surface that takes focus, and no APP3-S11 ' +
  'mobile control anywhere; and an OpenAPI artifact of 37 paths, 42 operations and 84 schemas, a ' +
  'generated client, a migration count, a dependency set and a root-script count all unchanged.';

if (process.argv[1]?.endsWith('check-app3-s10.mjs')) {
  const failures = [];
  checkApp3S10(REPO_ROOT, (message) => failures.push(message));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(HEADLINE);
}
