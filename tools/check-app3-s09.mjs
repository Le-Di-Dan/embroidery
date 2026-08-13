#!/usr/bin/env node
/**
 * `APP3-S09` — the Studio runtime watermark gate.
 *
 * The ways a watermark ships looking right and being wrong:
 *
 * - **It enters the document.** A watermark element, a root field or a stored
 *   token looks identical on screen and is then saved, hashed, listed as a
 *   layer, selectable, transformable and — the part that matters — *removable*
 *   by the customer it exists to mark.
 * - **It is anchored to document coordinates.** Correct at fit and gone from the
 *   visible preview at 400 % with a pan, which is precisely the screenshot
 *   somebody would take.
 * - **The token is derived from something.** A hash of the document is stable
 *   across reloads and identical for two customers with the same design; a
 *   Session id, a cookie or a user agent puts real identity into a picture the
 *   customer is invited to share.
 * - **`Math.random()`.** Unguessable-looking and not unguessable.
 * - **One treatment.** Ink over dark imagery is invisible, and an invisible
 *   watermark is not a watermark.
 * - **It blocks the pointer.** A full-bleed overlay that takes clicks makes the
 *   artwork underneath unselectable.
 * - **A screenshot hack.** A PrintScreen trap, a blur-on-blur trick or a
 *   contextmenu block is security theatre that a policy note then has to lie
 *   about.
 *
 * This module rules on the predecessors, the design approval and the artifacts;
 * `check-app3-s09-runtime.mjs` rules on the watermark itself.
 *
 * Read-only, cross-platform pure Node. Independent of the completion report.
 */
import { isS08Delivered, isS10Delivered } from './app3-accepted-paths.mjs';
import {
  CANONICAL_FILES,
  LATER_DESIGN_ROWS,
  REPO_ROOT,
  S09_DESIGN_ROWS,
  read,
} from './check-app3-s09.sources.mjs';
import {
  checkAccessibility,
  checkCommandIndex,
  checkContrast,
  checkFileSizes,
  checkImmutability,
  checkNoExport,
  checkNotSerialized,
  checkPattern,
  checkToken,
  checkViewportAnchored,
} from './check-app3-s09-runtime.mjs';

export {
  checkAccessibility,
  checkCommandIndex,
  checkContrast,
  checkFileSizes,
  checkImmutability,
  checkNoExport,
  checkNotSerialized,
  checkPattern,
  checkToken,
  checkViewportAnchored,
};

/** The predecessors a runtime watermark is only meaningful on top of. */
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
const LATER_ROWS = ['APP3-S08', 'APP3-S10', 'APP3-S11'];

/** The statuses `APP3-S09` may legitimately be recorded under. */
const STATUS_LINES = [
  'APP3-S09 = BLOCKED_BY_APP3-S04_REVIEW_ACCEPTANCE',
  'APP3-S09 = READY — NOT STARTED',
  'APP3-S09 = COMPLETE — REVIEW_DELIVERED',
  'APP3-S09 = COMPLETE — REVIEW_ACCEPTED',
];

export function isS09Delivered(rootDir) {
  return /\nAPP3-S09 = COMPLETE/.test(read(rootDir, 'phase') ?? '');
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
  if (!STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S09 is not recorded under a legitimate status`);
  }
  // World-aware on `APP3-S08` for the same reason every predecessor is: "S09
  // did not implement this" stays true once S08 implements it for itself.
  const opened = new Set([
    ...(isS08Delivered(rootDir) ? ['APP3-S08'] : []),
    ...(isS10Delivered(rootDir) ? ['APP3-S10'] : []),
  ]);
  const stillLaterRows = LATER_ROWS.filter((row) => !opened.has(row));
  for (const later of stillLaterRows) {
    if (new RegExp(`\\n${later} = COMPLETE`).test(phase)) {
      fail(
        `${CANONICAL_FILES.phase}: ${later} is recorded complete by a checkpoint that is not it`,
      );
    }
  }

  if (!isS09Delivered(rootDir)) return;
  /*
   * The facts a reader cannot recompute from the source.
   *
   * The contrast ruling is the one that matters most. Nothing in the code says
   * "both approved treatments are drawn because sampling the customer's photo
   * was refused" — a reader would see two spans and assume a style choice — so
   * the status has to carry the reasoning, and this rule is what stops it being
   * dropped when someone later decides one treatment would be simpler.
   */
  for (const line of [
    'APP3-S09 DOCUMENT = NOT_SERIALIZED',
    'APP3-S09 LAYER = VIEWPORT_SIBLING_OF_THE_S07_TRANSFORM',
    'APP3-S09 TOKEN = CRYPTO_RANDOM_ONCE_PER_RUNTIME',
    'APP3-S09 TOKEN_PII = NONE',
    'APP3-S09 CONTRAST = BOTH_APPROVED_TREATMENTS_DRAWN',
    'APP3-S09 POLICY = TWO_FACTS_NO_PROMISE',
    'APP3-S09 EXPORT = NONE',
    'APP3-S09 API = ZERO',
    'APP3-S09 MIGRATION = NONE',
    'APP3-S09 DEPENDENCY = NONE',
  ]) {
    if (!phase.includes(`\n${line}`)) {
      fail(`${CANONICAL_FILES.phase}: "${line}" is not recorded`);
    }
  }
}

/** Exactly the four section-13 rows, approved, and nothing else released. */
export function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry') ?? '';
  const rowOf = (id) => registry.split('\n').find((line) => line.startsWith(`| ${id} |`));

  for (const [id, node] of Object.entries(S09_DESIGN_ROWS)) {
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
    if (!row.includes('APP3-S09')) {
      fail(`${CANONICAL_FILES.registry}: ${id} carries no APP3-S09 approval evidence`);
    }
  }

  // The tablet reference stays D01-C1's. A reference re-attributed to a
  // checkpoint becomes a licence for every capability drawn on it.
  const tablet = rowOf('FIG-STUDIO-EDITING-TABLET-1024');
  if (tablet !== undefined && tablet.includes('APP3-S09')) {
    fail(`${CANONICAL_FILES.registry}: the 1024 reference was re-attributed to APP3-S09`);
  }

  const openedRows = new Set([
    ...(isS08Delivered(rootDir) ? ['FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY'] : []),
    ...(isS10Delivered(rootDir) ? ['FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED'] : []),
  ]);
  const stillLater = LATER_DESIGN_ROWS.filter((row) => !openedRows.has(row));
  for (const later of stillLater) {
    const row = rowOf(later);
    if (row !== undefined && row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${CANONICAL_FILES.registry}: ${later} belongs to a later checkpoint and is approved`);
    }
  }
}

export function checkApp3S09(rootDir, fail) {
  checkPredecessors(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkCommandIndex(rootDir, fail);
  checkFileSizes(rootDir, fail);
  checkImmutability(rootDir, fail);

  // The runtime rules read this checkpoint's own source, so running them before
  // it ships would rule on something that does not exist.
  if (isS09Delivered(rootDir)) {
    checkNotSerialized(rootDir, fail);
    checkViewportAnchored(rootDir, fail);
    checkToken(rootDir, fail);
    checkPattern(rootDir, fail);
    checkContrast(rootDir, fail);
    checkAccessibility(rootDir, fail);
    checkNoExport(rootDir, fail);
  }
}

const HEADLINE =
  'check:app3-s09 — the Studio runtime watermark on exactly the four approved section-13 rows: a ' +
  'repeated, diagonal, fixed-size overlay that is a sibling of the APP3-S07 viewport transform, so ' +
  'it covers the visible preview at every zoom step and pan offset instead of being carried off it; ' +
  'unrepresentable in a Design Document rather than merely absent from one, so APP3-P01 gains no ' +
  'watermark element, root field, token or coordinate and the mark can never be serialized, hashed, ' +
  'listed as a layer, selected, transformed or deleted; an opaque token minted once per runtime from ' +
  'crypto.getRandomValues with Math.random refused as a fallback and no argument through which a ' +
  'name, address, Session identity, cookie, storage key or asset id could reach it; both approved ' +
  'treatments drawn per mark — white at 22 % beneath, ink at 13 % above — so legibility on light and ' +
  'on dark imagery is met by construction rather than by sampling the customer’s own pixels; a mark ' +
  'count fixed by the viewport grid and independent of the element count, the zoom and the pan; ' +
  'pointer-events and selection off so the artwork underneath stays clickable, and the repeated ' +
  'pattern hidden from assistive technology with the policy stated once as real text; no download, ' +
  'export, print or share control and no PrintScreen trap, blur trick, contextmenu block or ' +
  'canvas-taint hack anywhere, because none of them works and the policy note refuses to claim ' +
  'otherwise; one SVG scene, zero canvas, zero API calls, and a migration count, root-script count ' +
  'and dependency set all unchanged.';

if (process.argv[1]?.endsWith('check-app3-s09.mjs')) {
  const failures = [];
  checkApp3S09(REPO_ROOT, (message) => failures.push(message));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(HEADLINE);
}
