#!/usr/bin/env node
/**
 * `APP3-S04` — the Studio layer capability gate.
 *
 * The ways a layer panel ships working and wrong:
 *
 * - **A second order.** A `zIndex` field, a layer array or a sorted projection
 *   is a second answer to "what is in front", and it agrees with the document
 *   until the first refused candidate. `APP3-P01` gives z-order no field: the
 *   element array *is* z-order, so a panel needs no order of its own.
 * - **A reversed renderer.** Reversing the paint to make the list read top-first
 *   is the same defect from the other end — the list gets easier and the stage
 *   starts disagreeing with `APP3-P01`.
 * - **Index keys.** A React key that is an array position re-binds every row the
 *   moment anything is restacked, which is the one thing this panel does.
 * - **A lock that is CSS.** `pointer-events: none` stops a mouse and stops
 *   nothing else — not the keyboard, not the inspector, not a programmatic path.
 * - **A hide that deletes.** Removing the element, or zeroing its opacity, each
 *   look right and destroy something: the first the layer, the second the
 *   distinction between hidden and transparent.
 * - **A drag-only reorder.** Unavailable to a keyboard, a switch and a screen
 *   reader alike.
 * - **An implicit reparent.** A drop that adds a `childIds` entry turns an
 *   ordinary restack into a grouping nobody asked for — and grouping is not
 *   authorized here at all.
 * - **A second drawer, or a mobile sheet.** `APP3-D01-C1` draws one right drawer
 *   at 1024 and `APP3-S11` owns every mobile editing surface.
 *
 * Read-only, cross-platform pure Node. Independent of the completion report.
 */
import { isS04Delivered, s04StatusLines } from './check-app3-s04-status.mjs';
import {
  CANONICAL_FILES,
  LATER_DESIGN_ROWS,
  REPO_ROOT,
  S04_DESIGN_ROWS,
  read,
} from './check-app3-s04.sources.mjs';
import {
  checkCandidatePipeline,
  checkComposition,
  checkFlags,
  checkGroupNotInvented,
  checkIdentity,
  checkOneOrder,
  checkCommandIndex,
  checkFileSizes,
  checkImmutability,
  checkReorder,
} from './check-app3-s04-runtime.mjs';

export {
  checkCandidatePipeline,
  checkComposition,
  checkFlags,
  checkGroupNotInvented,
  checkIdentity,
  checkOneOrder,
  checkCommandIndex,
  checkFileSizes,
  checkImmutability,
  checkReorder,
};

/** The predecessors this capability layers onto, all accepted. */
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
];

/** Studio capability rows that must not be recorded complete by this checkpoint. */
const LATER_ROWS = ['APP3-S08', 'APP3-S09', 'APP3-S10', 'APP3-S11'];

export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';

  for (const id of PREDECESSORS) {
    if (!phase.includes(`\n${id} = COMPLETE — REVIEW_ACCEPTED\n`)) {
      fail(`${CANONICAL_FILES.phase}: "${id} = COMPLETE — REVIEW_ACCEPTED" is not recorded`);
    }
  }
  if (!s04StatusLines().some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S04 is not recorded under a legitimate status`);
  }
  for (const later of LATER_ROWS) {
    if (new RegExp(`\\n${later} = COMPLETE`).test(phase)) {
      fail(
        `${CANONICAL_FILES.phase}: ${later} is recorded complete by a checkpoint that is not it`,
      );
    }
  }

  if (!isS04Delivered(rootDir)) return;
  /*
   * The facts a reader cannot recompute from the source.
   *
   * The group ruling is the one that matters. Nothing in the delivered code says
   * "grouping was considered and refused" — an absent capability looks exactly
   * like an unfinished one — so the status has to carry the finding, and this
   * rule is what stops the finding being quietly dropped when someone later
   * decides the roadmap row was satisfied after all.
   */
  for (const line of [
    'APP3-S04 GROUP = BLOCKED',
    'APP3-S04 GROUP_FRAME = NOT_AUTHORIZED',
    'APP3-S04 GROUP_MEMBER_SELECTION = NOT_AUTHORIZED',
    'APP3-S04 ZORDER = P01_ARRAY_ORDER',
    'APP3-S04 AUTOSAVE = NONE',
    'APP3-S04 MIGRATION = NONE',
    'APP3-S04 DEPENDENCY = NONE',
  ]) {
    if (!phase.includes(`\n${line}`)) {
      fail(`${CANONICAL_FILES.phase}: "${line}" is not recorded`);
    }
  }
}

/** Exactly the three section-08 rows, approved, and nothing else released. */
export function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry') ?? '';

  for (const [id, node] of Object.entries(S04_DESIGN_ROWS)) {
    const row = registry.split('\n').find((line) => line.startsWith(`| ${id} |`));
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
    if (!row.includes('APP3-S04')) {
      fail(`${CANONICAL_FILES.registry}: ${id} carries no APP3-S04 approval evidence`);
    }
  }

  // The tablet reference stays D01-C1's. A reference re-attributed to a
  // checkpoint becomes a licence for every capability drawn on it.
  const tablet = registry
    .split('\n')
    .find((line) => line.startsWith('| FIG-STUDIO-EDITING-TABLET'));
  if (tablet !== undefined && tablet.includes('APP3-S04')) {
    fail(`${CANONICAL_FILES.registry}: the 1024 reference was re-attributed to APP3-S04`);
  }

  for (const later of LATER_DESIGN_ROWS) {
    const row = registry.split('\n').find((line) => line.startsWith(`| ${later} |`));
    if (row !== undefined && row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${CANONICAL_FILES.registry}: ${later} belongs to a later checkpoint and is approved`);
    }
  }
}

export function checkApp3S04(rootDir, fail) {
  checkPredecessors(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkFileSizes(rootDir, fail);
  checkImmutability(rootDir, fail);

  // The runtime rules read this checkpoint's own source, so running them before
  // it ships would rule on something that does not exist.
  if (isS04Delivered(rootDir)) {
    checkOneOrder(rootDir, fail);
    checkIdentity(rootDir, fail);
    checkReorder(rootDir, fail);
    checkFlags(rootDir, fail);
    checkCandidatePipeline(rootDir, fail);
    checkGroupNotInvented(rootDir, fail);
    checkComposition(rootDir, fail);
  }
}

const HEADLINE =
  'check:app3-s04 — the Studio layer capability on exactly the three approved section-08 rows: one ' +
  'layer-list projection of the one working Design Document, reading top-first while the one native ' +
  'SVG scene still paints the APP3-P01 array bottom-first and is never reversed or re-ranked; rows ' +
  'keyed by the stable opaque element id and labelled by a bounded, code-point-safe derivation that ' +
  'never renders an internal identifier; a drag reorder with the approved drop indicator that changes ' +
  'the element array and nothing else — no transform, no parentage, no media, no id — beside a ' +
  'keyboard-operable adjacent move whose boundary controls are disabled from the real state and say ' +
  'why, with every restack announced; lock and hide mapped to the P01 locked and visible fields alone, ' +
  'never a CSS rule, a delete, an opacity or a recursive child rewrite, with a newly hidden selection ' +
  'reconciled so nothing keeps transform handles it may not use; every mutation ruled on by APP3-P01 ' +
  'before it is committed and none of it sent, saved, timed or remembered; grouping reported blocked ' +
  'rather than invented, with no childIds construction, no matrix inversion outside APP3-P02 and no ' +
  'multi-selection anywhere; one topbar, one right drawer and no mobile editing surface; and a ' +
  'migration count, dependency set and interaction-library set all unchanged.';

if (
  import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` ||
  process.argv[1]?.endsWith('check-app3-s04.mjs')
) {
  const failures = [];
  checkApp3S04(REPO_ROOT, (message) => failures.push(message));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(HEADLINE);
}
