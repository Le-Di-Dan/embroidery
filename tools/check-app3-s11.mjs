#!/usr/bin/env node
/**
 * `APP3-S11` — the Studio mobile-controls and touch-gesture gate.
 *
 * The ways mobile editing ships looking right and being wrong:
 *
 * - **The gesture is guessed.** A drag that infers "did they mean the design or
 *   the view?" from movement is wrong some of the time, and being wrong here
 *   means moving a design the customer thought they were only looking at.
 * - **The pinch produces a scale.** `ADR-APP0-001` measured its worst frame by
 *   driving a continuous pinch; a gesture that walks off `APP3-S07`'s frozen
 *   list restores the exact path the discrete zoom exists to make impossible.
 * - **A drag becomes sixty entries.** One gesture is one thing the customer
 *   did, and per-frame history is the same defect `APP3-S08` was built to avoid.
 * - **Touch bypasses the authority.** A finger that moves an element without
 *   `APP3-P02` ruling on the candidate is a design stitched outside the area.
 * - **A millimetre button writes a millimetre.** `IMP-D045` PO-04 makes scale
 *   the persisted resize model, and two of the five kinds ignore a width field.
 * - **The sheet is a div.** A modal that does not contain focus leaves the
 *   customer typing into controls hidden behind it.
 * - **The conflict is asked twice.** The same decision in two places, with the
 *   same two buttons, reads as two different decisions.
 * - **A mobile surface is hidden rather than absent.** A CSS-hidden toolbar is
 *   still focusable and its buttons still fire on a desktop.
 * - **The page stops scrolling.** `touch-action: none` on the document takes the
 *   customer's own scroll away for the whole route.
 *
 * This module rules on the predecessors, the design approval and the artifacts;
 * `check-app3-s11-runtime.mjs` rules on the gestures and the surfaces.
 *
 * Read-only, cross-platform pure Node. Independent of the completion report.
 */
import { foreignApprovals } from './app3-accepted-paths.mjs';
import {
  CANONICAL_FILES,
  LATER_DESIGN_ROWS,
  REPO_ROOT,
  S11_DESIGN_ROWS,
  read,
} from './check-app3-s11.sources.mjs';
import {
  checkArbitration,
  checkComposition,
  checkConflictProjection,
  checkFileSizes,
  checkImmutability,
  checkKeyboard,
  checkPinch,
  checkSheets,
  checkTargets,
  checkTransformSheet,
  checkUntouched,
  checkViewportOnly,
} from './check-app3-s11-runtime.mjs';

export {
  checkArbitration,
  checkComposition,
  checkConflictProjection,
  checkFileSizes,
  checkImmutability,
  checkKeyboard,
  checkPinch,
  checkSheets,
  checkTargets,
  checkTransformSheet,
  checkUntouched,
  checkViewportOnly,
};

/** The predecessors mobile access is only meaningful on top of. */
const PREDECESSORS = [
  'APP3-P01',
  'APP3-P02',
  'APP3-S02',
  'APP3-S03',
  'APP3-S03-C1',
  'APP3-S05',
  'APP3-S06',
  'APP3-S06-C1',
  'APP3-S07',
  'APP3-S09',
  'APP3-S10',
];

/** The next capability this checkpoint does not implement. */
const LATER_ROWS = ['APP3-E01'];

/** The statuses `APP3-S11` may legitimately be recorded under. */
const STATUS_LINES = [
  'APP3-S11 = BLOCKED_BY_APP3-S10_REVIEW_ACCEPTANCE_FOR_PRACTICAL_SEQUENCE',
  'APP3-S11 = READY — NOT STARTED',
  'APP3-S11 = COMPLETE — REVIEW_DELIVERED',
  'APP3-S11 = COMPLETE — REVIEW_ACCEPTED',
];

export function isS11Delivered(rootDir) {
  return /\nAPP3-S11 = COMPLETE/.test(read(rootDir, 'phase') ?? '');
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
  if (!STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S11 is not recorded under a legitimate status`);
  }
  for (const later of LATER_ROWS) {
    if (new RegExp(`\\n${later} = COMPLETE`).test(phase)) {
      fail(
        `${CANONICAL_FILES.phase}: ${later} is recorded complete by a checkpoint that is not it`,
      );
    }
  }
  /*
   * The ownership boundary, in both directions.
   *
   * `APP3-S10` owns the autosave loop and its cadence; this checkpoint owns
   * mobile and touch. A roadmap that moved the cadence here would make a value
   * in S10's own source unauthorized, and one that moved mobile back to S10
   * would make every file this checkpoint added unowned.
   */
  for (const owner of [
    'MOBILE_TOUCH_OWNER = APP3-S11',
    'AUTOSAVE_UI_OWNER = APP3-S10',
    'AUTOSAVE_CADENCE_OWNER = APP3-S10',
  ]) {
    if (!phase.includes(`\n${owner}`)) {
      fail(`${CANONICAL_FILES.phase}: "${owner}" is not recorded`);
    }
  }
  /*
   * The follow-ups this checkpoint may not close for itself.
   *
   * The `APP3-S10` retry observation is routed to `APP3-E01`; closing it here
   * would be repairing a predecessor's loop from a checkpoint that owns none of
   * it. The transform budget stays open and un-bisected.
   */
  for (const carried of [
    'FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01 = OPEN',
    'FU-APP3-TRANSFORM-BUDGET-01 = OPEN',
  ]) {
    if (!phase.includes(`\n${carried}`)) {
      fail(
        `${CANONICAL_FILES.phase}: "${carried}" was closed by a checkpoint that does not own it`,
      );
    }
  }

  if (!isS11Delivered(rootDir)) return;
  /*
   * The facts a reader cannot recompute from the source.
   *
   * The pinch ruling matters most: nothing in the code says "a discrete step was
   * chosen because the ADR measured 41 ms by driving a continuous pinch" — a
   * reader would see a lookup and assume taste — so the status carries the
   * reasoning, and this rule stops it being dropped when someone later decides a
   * smooth zoom would feel nicer.
   */
  for (const line of [
    'APP3-S11 GESTURES = ONE_FINGER_IS_THE_DESIGN_TWO_ARE_THE_CAMERA',
    'APP3-S11 PINCH = DISCRETE_STEP_NEVER_A_SCALE',
    'APP3-S11 VIEWPORT_GESTURES = ZERO_DOCUMENT_ZERO_HISTORY_ZERO_AUTOSAVE',
    'APP3-S11 ARBITRATION_HANDOFF = S03_CANCELLATION_SEMANTICS',
    'APP3-S11 TOUCH_SEAM = ONE_CAPABILITY_FLAG_NOT_A_SECOND_PATH',
    'APP3-S11 HANDLES = FOUR_CORNERS_THAT_OPEN_THE_SHEET',
    'APP3-S11 TRANSFORM_SHEET = BUTTONS_INTO_THE_ACCEPTED_AUTHORITY',
    'APP3-S11 TRANSFORM_READOUT = MEASURED_NOT_ECHOED',
    'APP3-S11 TRANSFORM_STEPS = PRESENTATION_ONLY_1MM_AND_1DEG',
    'APP3-S11 LAYERS_SHEET = S04_CONTROLLER_WITH_A_TOUCH_PATH',
    'APP3-S11 TEXT_SHEET = S05_INSPECTOR_UNCHANGED',
    'APP3-S11 KEYBOARD = MEASURED_VISUAL_VIEWPORT_INSET',
    'APP3-S11 IMAGE_SHEET = S06_INSPECTOR_UNCHANGED',
    'APP3-S11 UNDO = TOOLBAR_ONLY_NO_MOBILE_LIST',
    'APP3-S11 CONFLICT_SHEET = S10_DECISION_RELOCATED',
    'APP3-S11 SHEETS = ONE_PRIMITIVE_FIVE_CALLERS',
    'APP3-S11 SHELL_390 = ONE_TOPBAR_ONE_CHIP_ONE_STAGE_ONE_TOOLBAR',
    'APP3-S11 MOBILE_ONLY_BY_CONSTRUCTION = REACT_NOT_CSS',
    'APP3-S11 MIGRATION = NONE',
    'APP3-S11 DEPENDENCY = NONE',
  ]) {
    if (!phase.includes(`\n${line}`)) {
      fail(`${CANONICAL_FILES.phase}: "${line}" is not recorded`);
    }
  }
}

/** Exactly the six section-15 rows, approved, and nothing else released. */
export function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry') ?? '';
  const rowOf = (id) => registry.split('\n').find((line) => line.startsWith(`| ${id} |`));
  const delivered = isS11Delivered(rootDir);

  for (const [id, node] of Object.entries(S11_DESIGN_ROWS)) {
    const row = rowOf(id);
    if (row === undefined) {
      fail(`${CANONICAL_FILES.registry}: ${id} is missing from the registry`);
      continue;
    }
    if (!row.includes(`| ${node} |`)) {
      fail(`${CANONICAL_FILES.registry}: ${id} does not carry node ${node}`);
    }
    if (delivered && !row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${CANONICAL_FILES.registry}: ${id} is not approved, so S11 may not consume it`);
    }
    if (delivered && !row.includes('APP3-S11')) {
      fail(`${CANONICAL_FILES.registry}: ${id} does not record APP3-S11 as its approval evidence`);
    }
  }

  // The shared 1024 reference stays `APP3-D01-C1`'s. A reference re-attributed to
  // a checkpoint becomes a licence for every capability drawn on it.
  const tablet = rowOf('FIG-STUDIO-EDITING-TABLET-1024');
  if (tablet !== undefined && tablet.includes('APP3-S11')) {
    fail(`${CANONICAL_FILES.registry}: the 1024 reference was re-attributed to APP3-S11`);
  }

  for (const later of LATER_DESIGN_ROWS) {
    const row = rowOf(later);
    if (row !== undefined && row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(
        `${CANONICAL_FILES.registry}: ${later} belongs to no capability checkpoint and is approved`,
      );
    }
  }

  /*
   * The guard that does not empty itself.
   *
   * Section 15 is the last Studio section, so "a later row is approved" has
   * nothing left to catch among the capability rows. A blanket approval was
   * never really that anyway — it is "a row was released by a checkpoint that
   * did not own it", and that stays checkable forever.
   */
  for (const claimed of foreignApprovals(registry, 'APP3-S11', Object.keys(S11_DESIGN_ROWS))) {
    fail(`${CANONICAL_FILES.registry}: ${claimed} was approved as APP3-S11 evidence`);
  }
}

/** The four scoped commands, registered and discoverable. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-S11',
    'CMD-TEST-APP3-S11',
    'CMD-TEST-APP3-S11-STOREFRONT',
    'CMD-BROWSER-APP3-S11',
    'CMD-BENCH-APP3-S11',
  ]) {
    if (!index.includes(`\`${command}\``)) {
      fail(`${CANONICAL_FILES.index}: ${command} is not registered`);
    }
  }
  // Checkpoint commands are run directly and indexed, never added to the root
  // package (`VALIDATION_GOVERNANCE` §1.1, §5).
  const rootPackage = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  for (const name of Object.keys(rootPackage.scripts ?? {})) {
    if (/app3-s11|s11/i.test(name)) {
      fail(`${CANONICAL_FILES.rootPackage}: "${name}" is a checkpoint command in the root package`);
    }
  }
}

export function checkApp3S11(rootDir, fail) {
  checkPredecessors(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkImmutability(rootDir, fail);
  checkFileSizes(rootDir, fail);
  if (!isS11Delivered(rootDir)) return;
  checkArbitration(rootDir, fail);
  checkPinch(rootDir, fail);
  checkViewportOnly(rootDir, fail);
  checkTransformSheet(rootDir, fail);
  checkSheets(rootDir, fail);
  checkConflictProjection(rootDir, fail);
  checkComposition(rootDir, fail);
  checkTargets(rootDir, fail);
  checkKeyboard(rootDir, fail);
  checkUntouched(rootDir, fail);
}

const SUMMARY =
  'check:app3-s11 — Studio mobile controls and touch gestures over the accepted APP3-S02…S10 ' +
  'Studio, on exactly the six approved section-15 rows: one finger is the design and two are the ' +
  'camera, decided by the live touch count rather than inferred from movement, and arbitrated in ' +
  'the capture phase so a finger that lands on an element is still counted; a pinch that resolves ' +
  'to an index in the frozen APP3-S07 zoom list and never to a scale; viewport gestures that ' +
  'reach the camera and nothing else — zero document, zero history, zero autosave; a second ' +
  'finger that closes an open element drag through APP3-S03 own cancellation, into one entry or ' +
  'none; a numeric transform sheet whose every press is ruled on by APP3-P02, writes scale rather ' +
  'than a millimetre, and reads back a measured size; one modal sheet primitive with focus ' +
  'contained both ways and a conflict that may not be dismissed; the APP3-S10 decision relocated ' +
  'rather than duplicated, with the desktop region suppressed at 390; a mobile composition ' +
  'mounted by tier rather than hidden by CSS, with no second toolbar, no create-text control and ' +
  'no group; 44 px bound to the shared token, touch suppression scoped to the stage surface, and ' +
  'every glyph carrying a word; a keyboard inset measured from VisualViewport rather than ' +
  'assumed; and one native SVG, the APP3-S09 watermark, no export, no gesture dependency, and an ' +
  'unchanged OpenAPI artifact of 37 paths / 42 operations / 84 schemas, migration count and ' +
  'root-script count.';

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const failures = [];
  checkApp3S11(REPO_ROOT, (message) => failures.push(message));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(SUMMARY);
  }
}
