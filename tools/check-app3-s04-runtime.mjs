/**
 * `APP3-S04` — the runtime rules: what the layer list projects, what a reorder
 * may change, where lock and hide live, and what grouping must not become.
 *
 * Split from `check-app3-s04.mjs` by responsibility, and because one file
 * carrying the governance rules and these crossed the tooling soft cap. That
 * module rules on the predecessors, the design approval and the artifacts that
 * must not move; this one on what the panel actually does. Both import their
 * paths from `check-app3-s04.sources.mjs`, so neither carries a copy.
 *
 * Read-only, cross-platform pure Node.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  CANONICAL_FILES,
  FEATURE,
  code,
  collect,
  featureCode,
  read,
} from './check-app3-s04.sources.mjs';

/** One document, one order, and that order is `APP3-P01`'s array. */
export function checkOneOrder(rootDir, fail) {
  const all = featureCode(rootDir);
  const model = code(rootDir, 'model');
  const scene = code(rootDir, 'scene');
  const stage = code(rootDir, 'stage');

  // No second z-order representation, anywhere in the feature.
  for (const invented of ['zIndex', 'z-index', 'zOrder', 'orderIndex', 'layerOrder']) {
    if (all.includes(invented)) {
      fail(`${FEATURE}: a second z-order representation ("${invented}")`);
    }
  }
  // Nor in the stylesheet: a CSS stacking number on a layer row is the same
  // second order wearing different clothes.
  if (/z-index/.test(code(rootDir, 'styles').replaceAll(/\.studio-drawer[\s\S]*?\n}/g, ''))) {
    fail(`${CANONICAL_FILES.styles}: a z-index outside the accepted drawer`);
  }

  // The renderer still paints the array as it stands.
  for (const reversal of ['.reverse()', '.sort(', '.toReversed(', '.toSorted(']) {
    if (scene.includes(reversal) || stage.includes(reversal)) {
      fail(`${CANONICAL_FILES.scene}: the paint order is re-ranked ("${reversal}")`);
    }
  }
  // And the list is the reversal of it, computed once, in the projection.
  if (!/\.reverse\(\)/.test(model)) {
    fail(`${CANONICAL_FILES.model}: the layer list is not the document order reversed`);
  }
  for (const ranking of ['.sort(', 'localeCompare', 'createdAt', 'Date.now']) {
    if (model.includes(ranking)) {
      fail(`${CANONICAL_FILES.model}: the list is ranked by something other than P01 order`);
    }
  }

  // No second working document, and no store holding one.
  const stores = collect(join(rootDir, FEATURE, 'store'), /\.ts$/).map((path) =>
    relative(rootDir, path).replaceAll('\\', '/'),
  );
  const expected = [
    CANONICAL_FILES.document,
    `${FEATURE}/store/studio-interaction.store.ts`,
    `${FEATURE}/store/studio-viewport.store.ts`,
  ];
  for (const store of stores) {
    if (!expected.includes(store)) fail(`${store}: a fourth Studio store`);
  }
  if (/DesignDocument/.test(code(rootDir, 'interaction'))) {
    fail(`${CANONICAL_FILES.interaction}: the interaction store holds a document`);
  }
}

/** The row is keyed by the P01 id, and never labelled with one. */
export function checkIdentity(rootDir, fail) {
  const list = code(rootDir, 'list');
  const model = code(rootDir, 'model');

  if (!/key=\{row\.id\}/.test(list)) {
    fail(`${CANONICAL_FILES.list}: a layer row is not keyed by its stable element id`);
  }
  for (const indexKey of ['key={index}', 'key={String(index)}', 'key={`${index}']) {
    if (list.includes(indexKey)) {
      fail(`${CANONICAL_FILES.list}: a layer row is keyed by its array position`);
    }
  }
  // The label comes from the model's bounded derivation, not from a raw field.
  if (!/row\.label/.test(list)) {
    fail(`${CANONICAL_FILES.list}: the row does not use the derived label`);
  }
  for (const leak of ['row.id}<', '{row.id}</span', 'assetId', 'derivativeId', 'storageKey']) {
    if (list.includes(leak)) {
      fail(`${CANONICAL_FILES.list}: an internal identifier is rendered as customer copy`);
    }
  }
  // The bounded label is bounded by code points, not UTF-16 units.
  if (!/\[\.\.\.trimmed\]|Array\.from\(trimmed\)/.test(model)) {
    fail(`${CANONICAL_FILES.model}: the text label is cut by UTF-16 unit rather than code point`);
  }
}

/** Reorder changes the array and nothing else, and is never drag-only. */
export function checkReorder(rootDir, fail) {
  const model = code(rootDir, 'model');
  const list = code(rootDir, 'list');
  const hook = code(rootDir, 'hook');

  const move = slice(
    model,
    'export function withElementMovedTo',
    'export function withElementStepped',
  );
  if (move === '') {
    fail(`${CANONICAL_FILES.model}: there is no distinct reorder rule`);
  } else {
    // Only the array is rebuilt. Anything that names a field is a reorder that
    // changes something a reorder may not change.
    for (const mutated of [
      'transform',
      'childIds',
      'visible:',
      'locked:',
      'assetId',
      'derivativeId',
      'text:',
      'crypto.randomUUID',
    ]) {
      if (move.includes(mutated)) {
        fail(`${CANONICAL_FILES.model}: a reorder changes "${mutated}"`);
      }
    }
    if (!/splice\(/.test(move)) {
      fail(`${CANONICAL_FILES.model}: the reorder does not move within the element array`);
    }
  }

  // Drag is offered, and is never the only way.
  if (!/onDragStart/.test(list) || !/onDrop/.test(list)) {
    fail(`${CANONICAL_FILES.list}: the approved drag reorder is missing`);
  }
  if (!/data-drop=/.test(list)) {
    fail(`${CANONICAL_FILES.list}: the approved drop indicator is missing`);
  }
  const steps = (list.match(/layers\.step\(/g) ?? []).length;
  if (steps < 1) {
    fail(`${CANONICAL_FILES.list}: there is no keyboard-operable reorder control`);
  }
  if (!/<button/.test(list)) {
    fail(`${CANONICAL_FILES.list}: the reorder control is not a real button`);
  }
  if (!/disabled=\{reason !== null\}/.test(list)) {
    fail(`${CANONICAL_FILES.list}: a boundary control is not disabled from the real state`);
  }
  if (!/aria-describedby/.test(list)) {
    fail(`${CANONICAL_FILES.list}: a disabled control does not say why`);
  }
  // The announcement, and a live region to carry it.
  if (!/role="status"/.test(list) || !/announcement/.test(list)) {
    fail(`${CANONICAL_FILES.list}: a reorder is not announced`);
  }
  if (!/setAnnouncement/.test(hook)) {
    fail(`${CANONICAL_FILES.hook}: nothing produces the announcement`);
  }
}

/** Lock and hide are the P01 fields, and only the P01 fields. */
export function checkFlags(rootDir, fail) {
  const model = code(rootDir, 'model');
  const hook = code(rootDir, 'hook');
  const styles = code(rootDir, 'styles');

  if (!/\{ \.\.\.element, visible \}/.test(model)) {
    fail(`${CANONICAL_FILES.model}: hide does not map to the P01 visible field`);
  }
  if (!/\{ \.\.\.element, locked \}/.test(model)) {
    fail(`${CANONICAL_FILES.model}: lock does not map to the P01 locked field`);
  }
  // Hide is not a delete, a move or an opacity.
  const visibility = slice(
    model,
    'export function withElementVisible',
    'export function withElementLocked',
  );
  for (const substitute of ['opacity', 'filter((', 'splice(', 'slice(']) {
    if (visibility.includes(substitute)) {
      fail(`${CANONICAL_FILES.model}: hide is implemented as "${substitute}"`);
    }
  }
  /*
   * Lock is not CSS.
   *
   * Ruled on the layer panel's **own** blocks rather than on the tail of the
   * stylesheet: `.studio-stage__image` legitimately disables pointer events so a
   * click lands on the labelled control that wraps it, and a rule that read
   * everything after `.studio-layers` fired on that accepted declaration instead
   * of on a lock.
   */
  const layerBlocks = (styles.match(/^\.studio-layers[^\n]*\{[\s\S]*?^\}/gm) ?? []).join('\n');
  if (/pointer-events:\s*none/.test(layerBlocks)) {
    fail(`${CANONICAL_FILES.styles}: the lock is a CSS rule`);
  }
  // A locked group is not rewritten into its children.
  const locking = slice(model, 'export function withElementLocked', 'function withFlag');
  if (/childIds/.test(locking)) {
    fail(`${CANONICAL_FILES.model}: locking a group rewrites its children`);
  }
  // A hidden selection is reconciled rather than left holding handles.
  if (!/clearSelection\(\)/.test(hook)) {
    fail(`${CANONICAL_FILES.hook}: hiding the selected element does not reconcile the selection`);
  }
}

/** Every mutation is a candidate P01 rules on, and nothing is sent. */
export function checkCandidatePipeline(rootDir, fail) {
  const hook = code(rootDir, 'hook');
  const all = featureCode(rootDir);

  if (!/validateDesignDocumentStructure\(candidate\)/.test(hook)) {
    fail(`${CANONICAL_FILES.hook}: a candidate is committed without APP3-P01`);
  }
  if (!/if \(!structure\.ok\)/.test(hook)) {
    fail(`${CANONICAL_FILES.hook}: a refused candidate is committed anyway`);
  }
  // The document committed is the *validated* one, whatever else the call now
  // carries. `APP3-S08` added a second argument — the action the entry is named
  // after — and a rule pinned to the exact call shape would have read "the
  // committed document is not the validated one" about a call that still
  // commits exactly `structure.value`.
  if (!/commit\(structure\.value[,)]/.test(hook)) {
    fail(`${CANONICAL_FILES.hook}: the committed document is not the validated one`);
  }
  // Nothing here is sent, saved, timed or remembered.
  for (const persisted of [
    'publicDesignSessionAutosave',
    'localStorage',
    'sessionStorage',
    'setInterval',
    'setTimeout',
    'undoStack',
    'redoStack',
  ]) {
    if (hook.includes(persisted)) {
      fail(`${CANONICAL_FILES.hook}: a layer action reaches "${persisted}"`);
    }
  }
  if (all.includes('publicDesignSessionAutosave')) {
    fail(`${FEATURE}: autosave is APP3-S10's and is called here`);
  }
}

/**
 * Grouping is reported blocked, not invented.
 *
 * The rule is the *absence* of a construction, because that is the thing an
 * unauthorized capability looks like when someone implements it anyway: a
 * `childIds` array being built, a matrix being inverted outside `APP3-P02`, a
 * multi-selection accumulating in a store.
 */
export function checkGroupNotInvented(rootDir, fail) {
  const all = featureCode(rootDir);
  const owned = [code(rootDir, 'model'), code(rootDir, 'hook'), code(rootDir, 'list')].join('\n');

  // Nothing anywhere in the feature constructs a group or accumulates members.
  for (const constructed of [
    "type: 'group'",
    'childIds: [',
    'selectedElementIds',
    'toggleMember',
  ]) {
    if (all.includes(constructed)) {
      fail(`${FEATURE}: grouping is not authorized and "${constructed}" builds it`);
    }
  }
  /*
   * The matrix helpers are scoped to the layer files rather than banned.
   *
   * `APP3-S03` inverts a matrix for a legitimate reason — turning a pointer
   * position into element-local space — so a feature-wide ban would fire on an
   * accepted capability rather than on a rebase. What must not exist is a rebase
   * *in the layer capability*, which is where a group construction would live.
   */
  for (const rebase of ['invertMatrix', 'multiplyMatrices', 'composeMatrices', 'localMatrix']) {
    if (owned.includes(rebase)) {
      fail(`${CANONICAL_FILES.model}: the layer capability rebases coordinates ("${rebase}")`);
    }
  }
  // And S02's single selection is still single.
  if (
    /selectedElementId: (string \| null)\[\]|readonly selectedElementIds/.test(
      code(rootDir, 'interaction'),
    )
  ) {
    fail(`${CANONICAL_FILES.interaction}: the selection became multiple`);
  }
}

/** One drawer at 1024, nothing that edits at 390, one panel per tier. */
export function checkComposition(rootDir, fail) {
  const panel = code(rootDir, 'panel');
  const all = featureCode(rootDir);

  if (!/useStudioViewportTier\(\)/.test(panel)) {
    fail(`${CANONICAL_FILES.panel}: the panel does not resolve the accepted viewport tier`);
  }
  if (!/tier === 'tablet'/.test(panel) || !/slot === 'drawer'/.test(panel)) {
    fail(`${CANONICAL_FILES.panel}: the tablet composition does not use the accepted drawer`);
  }
  if (!/tier === 'mobile'/.test(panel)) {
    fail(`${CANONICAL_FILES.panel}: the mobile boundary is not stated`);
  }
  // Rendered, not hidden: a CSS-hidden list is still focusable and still fires.
  for (const hiddenSurface of ['display: none', 'visibility: hidden', 'aria-hidden']) {
    if (panel.includes(hiddenSurface)) {
      fail(`${CANONICAL_FILES.panel}: the mobile surface is hidden rather than not rendered`);
    }
  }
  // Exactly one drawer component in the whole feature, and it is S05-MI01's.
  const drawers = collect(join(rootDir, FEATURE, 'components'), /drawer.*\.tsx$/i).map((path) =>
    relative(rootDir, path).replaceAll('\\', '/'),
  );
  if (drawers.length !== 1) {
    fail(`${FEATURE}: expected exactly one drawer component, found ${String(drawers.length)}`);
  }
  // No S11 mobile sheet, and no second renderer.
  for (const later of [
    'BottomSheet',
    'bottom-sheet',
    'bottomSheet',
    '<canvas',
    "createElement('canvas'",
  ]) {
    if (all.includes(later)) fail(`${FEATURE}: a later checkpoint's surface ("${later}")`);
  }
}

/** The commands this checkpoint owns are discoverable. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  for (const id of ['CMD-CHECK-APP3-S04', 'CMD-TEST-APP3-S04', 'CMD-TEST-APP3-S04-STOREFRONT']) {
    if (!index.includes(id)) fail(`${CANONICAL_FILES.index}: ${id} is not registered`);
  }
}

/** CLAUDE.md §6, for every file this checkpoint owns. */
export function checkFileSizes(rootDir, fail) {
  for (const path of collect(join(rootDir, FEATURE), /\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > 400) {
      fail(`${relative(rootDir, path).replaceAll('\\', '/')}: ${String(lines)} lines exceeds 400`);
    }
  }
}

/** No dependency, no migration, no generated artifact touched. */
export function checkImmutability(rootDir, fail) {
  const manifest = read(rootDir, 'manifest') ?? '';
  for (const library of ['react-dnd', 'dnd-kit', 'sortablejs', 'interactjs', 'konva', 'fabric']) {
    if (manifest.includes(library)) {
      fail(`${CANONICAL_FILES.manifest}: an interaction library was added ("${library}")`);
    }
  }
  const migrations = collect(join(rootDir, 'packages/database/migrations'), /\.sql$/);
  if (migrations.length !== 34) {
    fail(
      `packages/database/migrations: expected 34 migrations, found ${String(migrations.length)}`,
    );
  }
}

/** The text between two markers, or `''` when either is missing. */
function slice(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to);
  if (start < 0 || end < 0 || end < start) return '';
  return source.slice(start, end);
}
