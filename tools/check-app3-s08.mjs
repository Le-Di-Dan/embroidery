#!/usr/bin/env node
/**
 * `APP3-S08` — the Studio undo / redo gate.
 *
 * The ways an undo ships looking right and being wrong:
 *
 * - **It is the renderer's history.** An engine stack serializes its own object
 *   graph, so what comes back from an undo is whatever that graph held rather
 *   than a document `APP3-P01` ever ruled on. `ADR-APP0-001` §6 forbids it in
 *   terms.
 * - **There are two currents.** A history controller with a "present" document
 *   beside the working one agrees with it until the first refused candidate,
 *   and then the stage and the undo stack are looking at different designs.
 * - **It is unbounded.** Fifty full documents is a browser tab; five thousand
 *   is a phone running out of memory in the middle of an edit.
 * - **It records a pointer frame.** A sixty-frame drag becomes sixty rows and
 *   sixty snapshots, the customer presses undo sixty times to take back one
 *   drag, and the allocation lands on the one surface `ADR-APP0-001` measured.
 * - **It records a keystroke.** The same defect in the text box, where it also
 *   fights the platform's own undo.
 * - **It survives a reload.** A history in `localStorage` is a save nobody
 *   reviewed, made by the checkpoint that does not own saving.
 * - **Undo has side effects.** An autosave, a revision move, an Asset delete or
 *   a second upload turns a control the customer expects to be free into a
 *   destructive server action.
 * - **It restores the camera.** Snapshotting the zoom, the pan or the selection
 *   makes an undo move things the customer did not change.
 * - **A raw id reaches a row.** A history list is the easiest place for an
 *   element id or a `derivativeId` to become customer-visible copy.
 *
 * This module rules on the predecessors, the design approval, the artifacts and
 * the contract; `check-app3-s08-runtime.mjs` rules on the history itself.
 *
 * Read-only, cross-platform pure Node. Independent of the completion report.
 */
import { foreignApprovals, isS10Delivered, isS11Delivered } from './app3-accepted-paths.mjs';
import {
  CANONICAL_FILES,
  LATER_DESIGN_ROWS,
  REPO_ROOT,
  S08_DESIGN_ROWS,
  read,
} from './check-app3-s08.sources.mjs';
import {
  checkBaselineCopy,
  checkBounded,
  checkCoalescing,
  checkControlPlacement,
  checkCommandIndex,
  checkDomainHistory,
  checkEntryContents,
  checkExcludedState,
  checkFileSizes,
  checkImmutability,
  checkIntegration,
  checkNoPersistence,
  checkNoSideEffects,
  checkOneCurrentDocument,
  checkOwnership,
  checkPanel,
  checkProjection,
  checkSafeLabels,
  checkShortcuts,
} from './check-app3-s08-runtime.mjs';

export {
  checkBaselineCopy,
  checkBounded,
  checkCoalescing,
  checkControlPlacement,
  checkCommandIndex,
  checkDomainHistory,
  checkEntryContents,
  checkExcludedState,
  checkFileSizes,
  checkImmutability,
  checkIntegration,
  checkNoPersistence,
  checkNoSideEffects,
  checkOneCurrentDocument,
  checkOwnership,
  checkPanel,
  checkProjection,
  checkSafeLabels,
  checkShortcuts,
};

/** The predecessors whose mutations this checkpoint has to be able to undo. */
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
];

/**
 * Studio capability rows that must not be recorded complete by this checkpoint.
 *
 * Empty since `APP3-S11` shipped: every Studio capability after `APP3-S08` now
 * belongs to a checkpoint that has opened, so each is excluded world-awarely at
 * the loop below rather than listed here. The constant stays because the next
 * unopened capability belongs in it, and because an empty list read at the call
 * site is honest about there being none.
 */
const LATER_ROWS = ['APP3-E01'];

/** The statuses `APP3-S08` may legitimately be recorded under. */
const STATUS_LINES = [
  'APP3-S08 = BLOCKED_BY_APP3-S09_REVIEW_ACCEPTANCE',
  'APP3-S08 = READY — NOT STARTED',
  'APP3-S08 = COMPLETE — REVIEW_DELIVERED',
  // The human-review verdict, and the form it takes once the correction ships.
  'APP3-S08 = COMPLETE — REVIEW_DELIVERED — CORRECTION_REQUIRED',
  'APP3-S08 = COMPLETE — REVIEW_DELIVERED — CORRECTED_BY_APP3-S08-C1',
  'APP3-S08 = COMPLETE — REVIEW_ACCEPTED',
  // Human review accepted the correction, so the accepted form carries the same
  // provenance the delivered one did.
  'APP3-S08 = COMPLETE — REVIEW_ACCEPTED — CORRECTED_BY_APP3-S08-C1',
];

export function isS08Delivered(rootDir) {
  return /\nAPP3-S08 = COMPLETE/.test(read(rootDir, 'phase') ?? '');
}

export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';

  for (const id of PREDECESSORS) {
    if (!phase.includes(`\n${id} = COMPLETE — REVIEW_ACCEPTED\n`)) {
      fail(`${CANONICAL_FILES.phase}: "${id} = COMPLETE — REVIEW_ACCEPTED" is not recorded`);
    }
  }
  // `APP3-S04` carries its group deferral in its own status line, so it is
  // matched by prefix rather than by the bare accepted form.
  if (!/\nAPP3-S04 = COMPLETE — REVIEW_ACCEPTED/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: APP3-S04 is not recorded as accepted`);
  }
  // The group deferral stays open. A history with no group action is correct
  // only while there is no group capability, and this is what says so.
  if (!/\nFU-APP3-S04-GROUP-AUTHORITY-01 = OPEN/.test(phase)) {
    fail(
      `${CANONICAL_FILES.phase}: the group-authority follow-up was closed by another checkpoint`,
    );
  }
  if (!STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S08 is not recorded under a legitimate status`);
  }
  // World-aware on `APP3-S10`: "S08 did not implement saving" stays true once
  // S10 implements it for itself, and the S10 gate is what checks that.
  for (const later of [
    ...LATER_ROWS,
    ...(isS10Delivered(rootDir) ? [] : ['APP3-S10']),
    ...(isS11Delivered(rootDir) ? [] : ['APP3-S11']),
  ]) {
    if (new RegExp(`\\n${later} = COMPLETE`).test(phase)) {
      fail(
        `${CANONICAL_FILES.phase}: ${later} is recorded complete by a checkpoint that is not it`,
      );
    }
  }

  if (!isS08Delivered(rootDir)) return;
  /*
   * The facts a reader cannot recompute from the source.
   *
   * The bound is the one that matters most. Nothing in the code says "fifty is
   * an operator fallback because no authority fixes a number" — a reader would
   * see a constant and assume it came from somewhere — so the status has to
   * carry the provenance, and this rule is what stops it being dropped when
   * someone later treats it as a published limit.
   */
  for (const line of [
    'APP3-S08 MODEL = DOMAIN_DOCUMENT_SNAPSHOTS',
    'APP3-S08 CURRENT_DOCUMENT = ONE',
    'APP3-S08 BOUND = 50',
    'APP3-S08 COALESCING = GESTURE_AND_TEXT_SESSION',
    'APP3-S08 PER_FRAME_COST = ZERO',
    'APP3-S08 REDO_CLEARED_BY = A_NEW_FORWARD_MUTATION_ONLY',
    'APP3-S08 SELECTION = NOT_HISTORY',
    'APP3-S08 VIEWPORT_AND_WATERMARK = UNCHANGED_BY_HISTORY',
    'APP3-S08 SIDE_EFFECTS = NONE',
    'APP3-S08 PERSISTENCE = NONE',
    'APP3-S08 SHORTCUTS = CTRL_CMD_Z_AND_CTRL_CMD_SHIFT_Z',
    'APP3-S08 HISTORY_LIST = INFORMATIONAL',
    'APP3-S08 MOBILE = NONE_PRE_S11',
    'APP3-S08 GROUP = ABSENT',
    'APP3-S08 MIGRATION = NONE',
    'APP3-S08 DEPENDENCY = NONE',
  ]) {
    if (!phase.includes(`\n${line}`)) {
      fail(`${CANONICAL_FILES.phase}: "${line}" is not recorded`);
    }
  }
}

/**
 * The correction's own record (`APP3-S08-C1`).
 *
 * Read from the phase status, never from the completion report: a gate that took
 * a report's prose as product truth would pass on the strength of a claim rather
 * than of a fact. Each line below states something a reader cannot recompute
 * from the source — most of all that the baseline row is projection, which the
 * code shows but does not explain.
 */
export function checkCorrection(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  if (!/\nAPP3-S08-C1 = /.test(phase)) return;

  for (const line of [
    'APP3-S08-C1 FIGMA_READ = LIVE_NODES_609_147_AND_609_209_AND_618_140',
    'APP3-S08-C1 DEFECT_1 = CONTROLS_WERE_IN_THE_PANEL_HEADER',
    'APP3-S08-C1 DEFECT_2 = PER_ROW_APPLIED_UNDONE_STATUS',
    'APP3-S08-C1 RAIL_SCOPE = UNDO_AND_REDO_ONLY',
    'APP3-S08-C1 ENGINE = UNCHANGED',
    'APP3-S08-C1 CURRENT_MARKER = EXACTLY_ONE_BY_CONSTRUCTION',
    'APP3-S08-C1 FUTURE_ROWS = VISIBLE',
    'APP3-S08-C1 BASELINE_COPY = LINEAGE_GATED_DISPLAY_NAME_ONLY',
    'APP3-S08-C1 BASELINE_GENERIC_COPY = PRESENTATION_FALLBACK_FOR_RUNTIME_WITHOUT_DISPLAY_NAME',
    'APP3-S08-C1 MOBILE = ZERO_S08_CONTROLS_AT_390',
    'APP3-S08-C1 SHELL = ONE_GRID_COLUMN_ADDED',
    'APP3-S08-C1 PERFORMANCE = PERFORMANCE_RESULT_REUSED_FROM_APP3_S08',
    'APP3-S08-C1 MIGRATION = NONE',
    'APP3-S08-C1 DEPENDENCY = NONE',
  ]) {
    if (!phase.includes(`\n${line}`)) {
      fail(`${CANONICAL_FILES.phase}: "${line}" is not recorded`);
    }
  }
  // The follow-up the correction closed, and the one it opened rather than
  // taking silently.
  if (
    !/\nFU-APP3-S08-DESIGN-READ-01 = COMPLETE — CLOSED_BY_HUMAN_REVIEW_LIVE_FIGMA_READ/.test(phase)
  ) {
    fail(`${CANONICAL_FILES.phase}: the design-read follow-up is not closed by the live read`);
  }
  if (!/\nFU-APP3-STUDIO-TOOL-RAIL-01 = OPEN/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: the deferred tool-rail composition is not recorded as open`);
  }
  // The transform budget stays this correction's non-scope.
  if (!/\nFU-APP3-TRANSFORM-BUDGET-01 = OPEN — NONBLOCKING/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: the transform-budget follow-up was closed by this correction`);
  }
  /*
   * S10 was blocked on this correction's acceptance, and then it was accepted.
   *
   * The rule is kept and made world-aware rather than deleted: before human
   * review it is what stopped the next checkpoint starting, and after it the
   * *record* of that acceptance is what must survive. A gate that simply dropped
   * the rule would let the sequencing be rewritten later with nothing to catch
   * it.
   */
  const s10Released =
    /\nAPP3-S08-C1 = COMPLETE — REVIEW_ACCEPTED/.test(phase) &&
    /\nS08_CARRY_FORWARD_RECONCILIATION_OWNER = APP3-S10/.test(phase);
  if (!s10Released && !/\nAPP3-S10 = BLOCKED_BY_APP3-S08-C1_REVIEW_ACCEPTANCE/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: APP3-S10 is not blocked on this correction's acceptance`);
  }
}

/** Exactly the two section-12 rows, approved, and nothing else released. */
export function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry') ?? '';
  const rowOf = (id) => registry.split('\n').find((line) => line.startsWith(`| ${id} |`));

  for (const [id, node] of Object.entries(S08_DESIGN_ROWS)) {
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
    if (!row.includes('APP3-S08')) {
      fail(`${CANONICAL_FILES.registry}: ${id} carries no APP3-S08 approval evidence`);
    }
  }

  // The tablet reference stays D01-C1's. A reference re-attributed to a
  // checkpoint becomes a licence for every capability drawn on it.
  const tablet = rowOf('FIG-STUDIO-EDITING-TABLET-1024');
  if (tablet !== undefined && tablet.includes('APP3-S08')) {
    fail(`${CANONICAL_FILES.registry}: the 1024 reference was re-attributed to APP3-S08`);
  }

  // World-aware for the same reason the status rows are: the autosave row stops
  // being evidence of a blanket approval once the checkpoint that owns it opens.
  const opened = new Set([
    ...(isS10Delivered(rootDir) ? ['FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED'] : []),
    ...(isS11Delivered(rootDir) ? ['FIG-STUDIO-MOBILE-LAYERSSHEET'] : []),
  ]);
  const stillLater = LATER_DESIGN_ROWS.filter((row) => !opened.has(row));
  for (const later of stillLater) {
    const row = rowOf(later);
    if (row !== undefined && row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${CANONICAL_FILES.registry}: ${later} belongs to a later checkpoint and is approved`);
    }
  }

  /*
   * The guard that does not empty itself.
   *
   * The rule above is world-aware, and `APP3-S11` is where that catches up with
   * it: with section 15 released there is no Studio row left belonging to an
   * unopened checkpoint, so the loop runs over nothing and asserts nothing —
   * exactly the failure `APP3-S04` recorded once already.
   *
   * A blanket approval was never really "a later row is approved". It is "a row
   * was released by a checkpoint that did not own it", and that stays checkable
   * forever: this checkpoint may be the approval evidence for its own rows and
   * for no others.
   */
  for (const claimed of foreignApprovals(registry, 'APP3-S08', Object.keys(S08_DESIGN_ROWS))) {
    fail(`${CANONICAL_FILES.registry}: ${claimed} was approved as APP3-S08 evidence`);
  }
}

export function checkApp3S08(rootDir, fail) {
  checkPredecessors(rootDir, fail);
  checkCorrection(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkImmutability(rootDir, fail);

  // The runtime rules read this checkpoint's own source, so running them before
  // it ships would rule on something that does not exist.
  if (!isS08Delivered(rootDir)) return;
  checkFileSizes(rootDir, fail);
  checkDomainHistory(rootDir, fail);
  checkEntryContents(rootDir, fail);
  checkOneCurrentDocument(rootDir, fail);
  checkBounded(rootDir, fail);
  checkCoalescing(rootDir, fail);
  checkIntegration(rootDir, fail);
  checkNoSideEffects(rootDir, fail);
  checkNoPersistence(rootDir, fail);
  checkExcludedState(rootDir, fail);
  checkShortcuts(rootDir, fail);
  checkPanel(rootDir, fail);
  checkControlPlacement(rootDir, fail);
  checkProjection(rootDir, fail);
  checkBaselineCopy(rootDir, fail);
  checkSafeLabels(rootDir, fail);
  checkOwnership(rootDir, fail);
}

const HEADLINE =
  'check:app3-s08 — Studio undo and redo on exactly the two approved section-12 design rows with ' +
  'every remaining Studio capability row still unapproved: history as domain APP3-P01 document ' +
  'snapshots rather than a renderer or engine stack, an entry holding two documents, one closed ' +
  'action kind and one bounded label and nothing a DOM node, an SVGElement, an APP3-P02 graph, a ' +
  'Blob, an object URL, a query result, an upload progress, a Session credential, a selection, a ' +
  'zoom, a pan or a watermark token could reach; the past and the future beside the one working ' +
  'document in the store that already owns it, so no second current document exists and an undo ' +
  'moves the cursor and writes the document in one set; a stated bound of fifty with the oldest ' +
  'entry discarded when it is reached and no copy implying an unlimited history anywhere; one ' +
  'entry per completed gesture and per completed text session with the baseline captured once at ' +
  'the boundary APP3-S03 already froze, so no snapshot, clone or serialization runs on a pointer ' +
  'frame, and no debounce timer is a semantic boundary; one entry per reorder, lock, hide, ' +
  'property edit, placement and replacement, and zero for a refused candidate, an unchanged ' +
  'before and after or an upload that never reached the document; a new forward mutation clearing ' +
  'the redo and a refused one leaving it intact; undo and redo calling no operation at all — no ' +
  'autosave, no revision move, no Asset delete, no re-upload — and restoring no selection, no ' +
  'viewport and no watermark token; nothing persisted to localStorage, sessionStorage, IndexedDB, ' +
  'a cookie or the URL and a new Session clearing both stacks; exactly two keyboard combinations ' +
  'bound on keydown, standing down for an already-answered event and for every editable field so ' +
  'the platform keeps its own text undo, with the listener removed on unmount; the two controls ' +
  'as real, really disabled buttons with stated reasons in the persistent left tool rail 609:147 ' +
  'and 618:140 draw and nowhere else, no duplicate pair in the history panel, the shortcut hint ' +
  'as its own informational box, and the rail persisting at 1024 rather than collapsing into the ' +
  'drawer; a baseline display row that is projection and never an entry, so a fresh runtime is ' +
  'still zero entries at cursor zero with undo disabled, exactly one current marker computed from ' +
  'the one cursor, the rows a redo would return to still visible, and no per-row applied or ' +
  'undone status anywhere; a baseline naming the Template only from a display name APP3-S01 ' +
  'already fetched and proved against this Session lineage, never a slug, a version or an id, ' +
  'bounded by the layer panel own limit and reached without a second Template read; an ' +
  'informational list with no unapproved time travel, ' +
  'no group action, no APP3-S11 mobile sheet and still one drawer at 1024; and an OpenAPI ' +
  'artifact, generated client, migration count, dependency set and root-script count all unchanged.';

if (process.argv[1]?.endsWith('check-app3-s08.mjs')) {
  const failures = [];
  checkApp3S08(REPO_ROOT, (message) => failures.push(message));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(HEADLINE);
}
