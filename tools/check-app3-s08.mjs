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
import {
  CANONICAL_FILES,
  LATER_DESIGN_ROWS,
  REPO_ROOT,
  S08_DESIGN_ROWS,
  read,
} from './check-app3-s08.sources.mjs';
import {
  checkBounded,
  checkCoalescing,
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
  checkSafeLabels,
  checkShortcuts,
} from './check-app3-s08-runtime.mjs';

export {
  checkBounded,
  checkCoalescing,
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

/** Studio capability rows that must not be recorded complete by this checkpoint. */
const LATER_ROWS = ['APP3-S10', 'APP3-S11'];

/** The statuses `APP3-S08` may legitimately be recorded under. */
const STATUS_LINES = [
  'APP3-S08 = BLOCKED_BY_APP3-S09_REVIEW_ACCEPTANCE',
  'APP3-S08 = READY — NOT STARTED',
  'APP3-S08 = COMPLETE — REVIEW_DELIVERED',
  'APP3-S08 = COMPLETE — REVIEW_ACCEPTED',
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
  for (const later of LATER_ROWS) {
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

  for (const later of LATER_DESIGN_ROWS) {
    const row = rowOf(later);
    if (row !== undefined && row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${CANONICAL_FILES.registry}: ${later} belongs to a later checkpoint and is approved`);
    }
  }
}

export function checkApp3S08(rootDir, fail) {
  checkPredecessors(rootDir, fail);
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
  'the platform keeps its own text undo, with the listener removed on unmount; real buttons with ' +
  'stated reasons, an informational list with no unapproved time travel, state carried as text, ' +
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
