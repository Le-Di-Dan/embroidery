#!/usr/bin/env node
/**
 * `APP3-S08` — the rules about the history itself.
 *
 * Split from `check-app3-s08.mjs` by responsibility and because the two
 * together crossed the 450-line soft cap: that module rules on the
 * predecessors, the design approval, the artifacts and the contract; this one
 * rules on the code the checkpoint wrote.
 *
 * Read-only, cross-platform pure Node.
 */
import { join } from 'node:path';

import {
  CANONICAL_FILES,
  FEATURE,
  S08_FILES,
  code,
  collect,
  featureCode,
  outsideS08Code,
  read,
  s08Code,
} from './check-app3-s08.sources.mjs';

const SOURCE_LIMIT = 400;
const TEST_LIMIT = 600;

/**
 * Domain snapshots, never an engine stack.
 *
 * `ADR-APP0-001` §6 and `IMP-D026` are identical on this, and the failure they
 * describe is not hypothetical: a renderer that owns the history serializes its
 * own object graph, and what comes back from an undo is whatever that graph
 * happened to hold rather than a document `APP3-P01` ever ruled on.
 */
export function checkDomainHistory(rootDir, fail) {
  const model = code(rootDir, 'model');
  const feature = featureCode(rootDir);

  for (const engine of ['toJSON()', 'toObject()', 'loadFromJSON', 'canvas.undo', 'engineHistory']) {
    if (feature.includes(engine)) {
      fail(`${FEATURE}: "${engine}" — history must be document snapshots, never an engine stack`);
    }
  }
  if (!model.includes('DesignDocument')) {
    fail(`${CANONICAL_FILES.model}: an entry does not carry a DesignDocument`);
  }
  // The two ends, held rather than recomputed. An inverse-operation undo has to
  // be able to invert every mutation exactly, and the first one it gets subtly
  // wrong corrupts a design rather than failing.
  for (const end of ['before', 'after']) {
    if (!new RegExp(`readonly ${end}: DesignDocument`).test(model)) {
      fail(`${CANONICAL_FILES.model}: an entry does not hold its "${end}" document`);
    }
  }
}

/** Nothing mutable, nothing private and nothing from the server in an entry. */
export function checkEntryContents(rootDir, fail) {
  const owned = s08Code(rootDir);
  for (const forbidden of [
    'SVGElement',
    'HTMLCanvas',
    'DOMRect',
    'DOMMatrix',
    'ElementGraph',
    'RenderableElement',
    'Blob',
    'createObjectURL',
    'objectUrl',
    'sessionSecret',
    'AbortController',
  ]) {
    if (owned.includes(forbidden)) {
      fail(`${FEATURE}: the history files reach "${forbidden}", which cannot be in a snapshot`);
    }
  }
}

/**
 * One current document, and the past beside it rather than competing with it.
 *
 * The store is where the working document already lives, so `document` staying
 * the only current is what makes an undo a *document change* rather than a
 * second scene the renderer might or might not be reading.
 */
export function checkOneCurrentDocument(rootDir, fail) {
  const store = code(rootDir, 'store');
  const feature = featureCode(rootDir);

  for (const competing of [
    'historyCurrentDocument',
    'historyDocument',
    'presentDocument',
    'currentSnapshot',
  ]) {
    if (feature.includes(competing)) {
      fail(`${FEATURE}: "${competing}" is a second current document`);
    }
  }
  for (const required of ['undo:', 'redo:', 'history:', 'openAction']) {
    if (!store.includes(required)) {
      fail(`${CANONICAL_FILES.store}: the one working-document store has no "${required}"`);
    }
  }
  /*
   * An undo that went through `commit` would append the entry the next undo
   * then reverses, and the state before it would be unreachable.
   *
   * Anchored on the **implementation**, not on `undo: ()`. The interface above
   * declares `readonly undo: () => void;` first, so the looser anchor sliced
   * between two type declarations and the rule read almost nothing while still
   * passing — the self-emptying failure `APP3-S04` recorded in the predecessor
   * gates. The mutation test is what caught it here.
   */
  const undoAt = store.indexOf('undo: () => {');
  const redoAt = store.indexOf('redo: () => {');
  if (undoAt < 0 || redoAt < 0 || redoAt <= undoAt) {
    fail(`${CANONICAL_FILES.store}: undo and redo are not both implemented, in that order`);
  } else if (store.slice(undoAt, redoAt).includes('commit(')) {
    fail(`${CANONICAL_FILES.store}: undo records itself as a new action`);
  }
  // Zustand is the only store; a second one holding a past would be a second
  // answer to what the customer can go back to.
  const stores = collect(join(rootDir, FEATURE, 'store'), /\.ts$/);
  if (stores.length !== 3) {
    fail(`${FEATURE}/store: expected exactly three stores, found ${String(stores.length)}`);
  }
}

/** Bounded, with the bound stated rather than discovered. */
export function checkBounded(rootDir, fail) {
  const model = code(rootDir, 'model');
  const list = code(rootDir, 'list');
  const copy = read(rootDir, 'copy') ?? '';

  const declared = /MAX_HISTORY_ENTRIES = (\d+)/.exec(model);
  if (declared === null) {
    fail(`${CANONICAL_FILES.model}: no MAX_HISTORY_ENTRIES bound is declared`);
  } else if (Number(declared[1]) <= 0 || Number(declared[1]) > 200) {
    fail(`${CANONICAL_FILES.model}: the bound ${String(declared[1])} is not a usable local limit`);
  }
  // The eviction, not merely the constant: a limit nothing enforces is a
  // comment.
  if (!/slice\(overflow\)/.test(model)) {
    fail(`${CANONICAL_FILES.model}: nothing discards the oldest entry at the bound`);
  }
  if (!list.includes('MAX_HISTORY_ENTRIES')) {
    fail(`${CANONICAL_FILES.list}: the panel does not state the bound`);
  }
  // `APP3-D01`'s directive for this section: do not imply an infinite history.
  for (const claim of ['vô hạn', 'không giới hạn', 'toàn bộ lịch sử', 'mọi thay đổi']) {
    if (publishedStrings(copy).includes(claim)) {
      fail(`${CANONICAL_FILES.copy}: "${claim}" implies an unlimited history`);
    }
  }
}

/**
 * Every customer-visible string a copy module publishes.
 *
 * Quoted **and** templated, because the sentence carrying the bound is a
 * template literal — a rule that read only single-quoted strings would have
 * missed exactly the sentence the bound rule exists to protect, and the mutation
 * test is what caught it.
 *
 * Prose is excluded on purpose: a gate that read comments fires on the docblock
 * that honestly explains why a claim is forbidden.
 */
function publishedStrings(source) {
  const stripped = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|[^:])\/\/.*$/gm, '$1');
  return [
    ...[...stripped.matchAll(/'([^'\n]*)'/g)].map((match) => match[1] ?? ''),
    ...[...stripped.matchAll(/`([^`]*)`/g)].map((match) => match[1] ?? ''),
  ].join(' ');
}

/**
 * A gesture and a text session each coalesce into one entry.
 *
 * The rule is about where `beginAction` and `endAction` are called, because
 * that is the only thing that decides whether a sixty-frame drag is one row or
 * sixty. A `commit` inside an open action appends nothing; a `commit` with none
 * open is atomic.
 */
export function checkCoalescing(rootDir, fail) {
  const transform = code(rootDir, 'transform');
  const text = code(rootDir, 'text');
  const controls = code(rootDir, 'controls');

  if (!transform.includes('beginAction({ kind, label })')) {
    fail(`${CANONICAL_FILES.transform}: a gesture does not open one coalesced action`);
  }
  if (!/onPointerUp:[\s\S]{0,600}endAction\(\)/.test(transform)) {
    fail(`${CANONICAL_FILES.transform}: a gesture does not close its action on release`);
  }
  // The baseline is `APP3-S03`'s frozen `startDocument`, captured once. A
  // snapshot taken per frame would put an allocation on the measured path.
  const applyBody = transform.slice(transform.indexOf('function apply()'));
  for (const perFrame of ['beginAction', 'JSON.parse', 'structuredClone', 'JSON.stringify']) {
    if (applyBody.slice(0, applyBody.indexOf('function begin(')).includes(perFrame)) {
      fail(`${CANONICAL_FILES.transform}: "${perFrame}" runs on every pointer frame`);
    }
  }
  if (!text.includes('beginEdit') || !text.includes('endAction')) {
    fail(`${CANONICAL_FILES.text}: a text edit is not bracketed as one session`);
  }
  // Focus and blur, not a timer: `APP3-S08` §11 forbids an arbitrary debounce
  // as the only semantic boundary.
  if (!controls.includes('onFocus={onBeginEdit}') || !controls.includes('onEndEdit()')) {
    fail(`${CANONICAL_FILES.controls}: the text box does not open and close an edit session`);
  }
  for (const timer of ['setTimeout', 'setInterval', 'debounce']) {
    if (text.includes(timer)) {
      fail(`${CANONICAL_FILES.text}: "${timer}" is not a deterministic edit boundary`);
    }
  }
}

/** Every capability names its action, and the atomic ones stay atomic. */
export function checkIntegration(rootDir, fail) {
  for (const [key, kinds] of [
    ['layers', ["kind: 'reorder'", "visible ? 'show' : 'hide'", "locked ? 'lock' : 'unlock'"]],
    ['image', ["'image-place' : 'image-replace'"]],
  ]) {
    const source = code(rootDir, key);
    for (const kind of kinds) {
      if (!source.includes(kind)) {
        fail(`${CANONICAL_FILES[key]}: no history action named ${kind}`);
      }
    }
  }
  // A capability that could commit without naming itself would be a document
  // change with no row and no way back.
  const store = code(rootDir, 'store');
  if (!/commit:\s*\(document,\s*action\)/.test(store)) {
    fail(`${CANONICAL_FILES.store}: commit does not require an action`);
  }
  // Group is absent because no group capability exists. A kind for one would be
  // the first half of a capability nobody authorized.
  if (/'(un)?group[^']*'/.test(code(rootDir, 'model'))) {
    fail(`${CANONICAL_FILES.model}: a group history action exists without a group capability`);
  }
}

/** Undo and redo reach no server, and no durable object. */
export function checkNoSideEffects(rootDir, fail) {
  const owned = s08Code(rootDir);
  for (const call of [
    'publicDesignSessionAutosave',
    'publicDesignSessionAsset',
    'getBrowserApiClient',
    'useMutation',
    'useQuery',
    'axios',
    'fetch(',
    'Delete',
    'delete(',
  ]) {
    if (owned.includes(call)) {
      fail(`${FEATURE}: the history files reach "${call}" — undo must call nothing`);
    }
  }
  // No delete operation exists on the boundary at all, which is what makes
  // "undo never deletes an Asset" structural rather than a promise.
  if (featureCode(rootDir).includes('publicDesignSessionAssetDelete')) {
    fail(`${FEATURE}: an Asset delete operation is reachable from the Studio`);
  }
}

/** Nothing about the history survives a reload. */
export function checkNoPersistence(rootDir, fail) {
  const feature = featureCode(rootDir);
  for (const store of [
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'IDBDatabase',
    'document.cookie',
    'history.pushState',
    'history.replaceState',
    'persist(',
  ]) {
    if (feature.includes(store)) {
      fail(`${FEATURE}: "${store}" would make a local history outlive its runtime`);
    }
  }
  /*
   * A different Session is a different design; an undo reaching back into the
   * previous one would restore coordinates that mean something else here.
   *
   * Anchored inside `initialize`. A rule that merely looked for `EMPTY_HISTORY`
   * somewhere in the store was satisfied by `reset`, which clears it for a
   * different reason — so a Session change could have kept the whole past and
   * the rule would still have passed. The mutation test caught that.
   */
  const store = code(rootDir, 'store');
  const initializeAt = store.indexOf('initialize: (sessionKey, document) => {');
  const commitAt = store.indexOf('commit: (document, action) => {');
  const initializeBody =
    initializeAt < 0 || commitAt <= initializeAt ? '' : store.slice(initializeAt, commitAt);
  if (!initializeBody.includes('EMPTY_HISTORY') || !initializeBody.includes('openAction: null')) {
    fail(`${CANONICAL_FILES.store}: a new Session does not clear the past and the future`);
  }
}

/** Selection, viewport and the watermark token are none of history's business. */
export function checkExcludedState(rootDir, fail) {
  const owned = s08Code(rootDir);
  for (const excluded of [
    'selectedElementId',
    'useStudioInteractionStore',
    'zoomStep',
    'panXRatio',
    'panYRatio',
    'useStudioViewportStore',
    'watermark',
    'Watermark',
    'revision',
  ]) {
    if (owned.includes(excluded)) {
      fail(`${FEATURE}: the history files reach "${excluded}", which is not document state`);
    }
  }
  const store = code(rootDir, 'store');
  for (const excluded of ['selectedElementId', 'zoomStep', 'watermark']) {
    if (store.includes(excluded)) {
      fail(`${CANONICAL_FILES.store}: "${excluded}" is in the store that holds the snapshots`);
    }
  }
}

/** The keyboard path, and the boundary it stands down at. */
export function checkShortcuts(rootDir, fail) {
  const shortcuts = code(rootDir, 'shortcuts');

  if (!shortcuts.includes("event.key.toLowerCase() !== 'z'")) {
    fail(`${CANONICAL_FILES.shortcuts}: the shortcut is not bound to Z`);
  }
  if (!shortcuts.includes('event.shiftKey')) {
    fail(`${CANONICAL_FILES.shortcuts}: redo is not the shifted combination`);
  }
  // Nothing authority establishes, so nothing is bound.
  if (/'y'/.test(shortcuts)) {
    fail(`${CANONICAL_FILES.shortcuts}: Ctrl+Y is bound without authority for it`);
  }
  if (!shortcuts.includes('event.defaultPrevented')) {
    fail(`${CANONICAL_FILES.shortcuts}: an already-answered keystroke is answered twice`);
  }
  // The guard has to be *called*, not merely defined. Deleting the call left
  // the helper in the file and the looser rule passed; the mutation caught it.
  if (!/if \(isEditable\(event\.target\)\) return;/.test(shortcuts)) {
    fail(`${CANONICAL_FILES.shortcuts}: the platform's own text undo is double-handled`);
  }
  if (!shortcuts.includes('removeEventListener')) {
    fail(`${CANONICAL_FILES.shortcuts}: the listener outlives the Studio`);
  }
  if (shortcuts.includes("addEventListener('keyup'")) {
    fail(`${CANONICAL_FILES.shortcuts}: keyup fires after the platform has already acted`);
  }
}

/** The panel: real buttons, stated reasons, an informational list, no S11 sheet. */
export function checkPanel(rootDir, fail) {
  const list = code(rootDir, 'list');
  const panel = code(rootDir, 'panel');

  /*
   * `disabled`, not `aria-disabled`. The distinction is the whole rule: an
   * `aria-disabled` button is still focusable and still fires its handler, so a
   * customer reaches an undo the state says is unavailable.
   *
   * Matched with a leading boundary, because `aria-disabled={!canUndo}`
   * *contains* `disabled={!canUndo}` — a plain substring rule passed the
   * mutation that made exactly that substitution.
   */
  if (!list.includes('type="button"')) {
    fail(`${CANONICAL_FILES.list}: a control is not a real button`);
  }
  for (const required of ['canUndo', 'canRedo']) {
    if (!new RegExp(`(^|[\\s{])disabled=\\{!${required}\\}`, 'm').test(list)) {
      fail(`${CANONICAL_FILES.list}: the ${required} control is not really disabled`);
    }
  }
  if (!list.includes('aria-describedby')) {
    fail(`${CANONICAL_FILES.list}: a disabled control states no reason`);
  }
  // Informational: `APP3-S08` §14 forbids inferring arbitrary time travel from
  // the presence of a list.
  const listBlock = list.slice(list.indexOf('<ol'), list.indexOf('</ol>'));
  for (const interactive of ['<button', 'onClick', 'tabIndex', 'role="button"']) {
    if (listBlock.includes(interactive)) {
      fail(`${CANONICAL_FILES.list}: the history list offers unapproved time travel`);
    }
  }
  // State as text, never colour alone.
  if (!list.includes('appliedFlag') || !list.includes('undoneFlag')) {
    fail(`${CANONICAL_FILES.list}: an undone row is distinguished by colour alone`);
  }
  // The three compositions, and nothing that belongs to `APP3-S11`.
  for (const tier of ["tier === 'tablet'", "tier === 'mobile'", 'tier === null']) {
    if (!panel.includes(tier)) {
      fail(`${CANONICAL_FILES.panel}: the ${tier} composition is missing`);
    }
  }
  for (const early of ['BottomSheet', 'bottom-sheet', 'onTouchStart', 'touchmove']) {
    if (panel.includes(early)) {
      fail(`${CANONICAL_FILES.panel}: "${early}" is an APP3-S11 surface delivered early`);
    }
  }
  // One drawer, still. A second over the same stage edge would be a second
  // drawer system.
  const panels = code(rootDir, 'panels');
  if ((panels.match(/slot="drawer"/g) ?? []).length !== 3) {
    fail(`${CANONICAL_FILES.panels}: the tablet drawer no longer holds exactly three sections`);
  }
  if (panels.includes('StudioTextDrawer')) {
    fail(`${CANONICAL_FILES.panels}: a second drawer was opened beside the accepted one`);
  }
}

/** No identifier reaches a row, and no capability nobody approved is promised. */
export function checkSafeLabels(rootDir, fail) {
  const copy = read(rootDir, 'copy') ?? '';
  const model = code(rootDir, 'model');

  for (const identifier of [
    'elementId',
    'assetId',
    'derivativeId',
    'sessionId',
    'JSON.stringify',
  ]) {
    if (model.includes(identifier)) {
      fail(`${CANONICAL_FILES.model}: "${identifier}" could reach a customer-visible row`);
    }
  }
  /*
   * The label is the layer panel's bounded name, not a second sanitizer.
   *
   * Asserted at each of the three call sites. A rule that only looked for
   * `layerLabel(` somewhere outside the history files was satisfied by the layer
   * projection's own use of it, so every capability could have switched to a raw
   * name and the rule would still have passed. The mutation caught that.
   */
  for (const key of ['transform', 'text', 'image']) {
    if (!code(rootDir, key).includes('layerLabel(')) {
      fail(`${CANONICAL_FILES[key]}: a history label is derived without the bounded layer name`);
    }
  }
  const published = [...copy.matchAll(/:\s*'([^']*)'/g)].map((match) => match[1] ?? '').join(' ');
  for (const promise of ['đã lưu', 'đang lưu', 'tải xuống', 'nhóm', 'sắp có']) {
    if (published.includes(promise)) {
      fail(`${CANONICAL_FILES.copy}: "${promise}" promises a capability this checkpoint lacks`);
    }
  }
}

/** The history exists nowhere but where this checkpoint put it. */
export function checkOwnership(rootDir, fail) {
  const outside = outsideS08Code(rootDir);
  for (const construction of [
    'MAX_HISTORY_ENTRIES',
    'recordAction',
    'historyRowsOf',
    'undoStack',
    'redoStack',
    'historyStack',
    'pushHistory',
  ]) {
    if (outside.includes(construction)) {
      fail(`${FEATURE}: "${construction}" is built outside the files APP3-S08 owns`);
    }
  }
}

/** Every file this checkpoint touched is inside the repository's limits. */
export function checkFileSizes(rootDir, fail) {
  const owned = [
    ...S08_FILES.map((path) => `${FEATURE}/${path}`),
    CANONICAL_FILES.store,
    CANONICAL_FILES.screen,
    CANONICAL_FILES.transform,
    CANONICAL_FILES.text,
  ];
  for (const path of owned) {
    const lines = (read(rootDir, path) ?? '').split('\n').length;
    if (lines > SOURCE_LIMIT) {
      fail(`${path}: ${String(lines)} lines exceeds the ${String(SOURCE_LIMIT)}-line source limit`);
    }
  }
  for (const path of [
    'apps/storefront/test/unit/studio-history-model.test.ts',
    'apps/storefront/test/components/studio-history.test.tsx',
  ]) {
    const lines = (read(rootDir, path) ?? '').split('\n').length;
    if (lines > TEST_LIMIT) {
      fail(`${path}: ${String(lines)} lines exceeds the ${String(TEST_LIMIT)}-line test limit`);
    }
  }
}

/** The contract, the manifest and the schema, all untouched. */
export function checkImmutability(rootDir, fail) {
  const manifest = read(rootDir, 'manifest') ?? '';
  for (const dependency of ['undo', 'history', 'immer', 'zundo', 'redux']) {
    if (new RegExp(`"[^"]*${dependency}[^"]*":`).test(manifest)) {
      fail(`${CANONICAL_FILES.manifest}: a history dependency was added`);
    }
  }
  /*
   * `APP3-P01` gains nothing. A history field in the document would be a past
   * that gets saved, hashed and sent.
   *
   * The rule is on a **declared field**, not on the word. `document.ts` names
   * the undo stack in prose — in the paragraph that explains why it is excluded
   * — and a gate matching the raw text would fail on the sentence that makes it
   * true. That is the proxy failure `APP3-B06B`, `APP3-B06C`, `APP3-S06`,
   * `APP3-S04` and `APP3-S09` each recorded, and it fired here too on the first
   * run of this gate.
   */
  for (const key of ['elements', 'document']) {
    const schema = code(rootDir, CANONICAL_FILES[key]);
    for (const added of ['history', 'undo', 'redo', 'revisionStack', 'past', 'future']) {
      if (new RegExp(`readonly\\s+${added}\\b|^\\s+${added}\\??:`, 'im').test(schema)) {
        fail(`${CANONICAL_FILES[key]}: a "${added}" field entered the APP3-P01 schema`);
      }
    }
  }
}

/** The scoped commands are indexed, and no root script was added. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-S08',
    'CMD-TEST-APP3-S08',
    'CMD-TEST-APP3-S08-STOREFRONT',
  ]) {
    if (!index.includes(command)) {
      fail(`${CANONICAL_FILES.index}: ${command} is not indexed`);
    }
  }
  const root = JSON.parse(read(rootDir, 'package.json') ?? '{}');
  const scripts = Object.keys(root.scripts ?? {});
  if (scripts.length !== 30) {
    fail(`package.json: ${String(scripts.length)} root scripts, expected 30`);
  }
  if (scripts.some((name) => name.includes('s08') || name.includes('history'))) {
    fail('package.json: a checkpoint command was added to the root manifest');
  }
}
