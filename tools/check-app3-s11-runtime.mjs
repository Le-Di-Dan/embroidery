#!/usr/bin/env node
/**
 * `APP3-S11` — the rules about the gestures and the mobile surfaces themselves.
 *
 * Split from `check-app3-s11.mjs` by responsibility and because the two together
 * would cross the 450-line soft cap: that module rules on the predecessors, the
 * design approval, the artifacts and the contract; this one rules on the code.
 *
 * Read-only, cross-platform pure Node.
 */
import { join } from 'node:path';

import {
  CANONICAL_FILES,
  DEBOUNCE_MS,
  EXPECTED_MIGRATIONS,
  EXPECTED_OPERATIONS,
  EXPECTED_PATHS,
  EXPECTED_SCHEMAS,
  FEATURE,
  MAX_DIRTY_AGE_MS,
  MIGRATIONS,
  ROOT_SCRIPTS,
  code,
  collect,
  featureCode,
  outsideS11Code,
  publishedValues,
  read,
  s11Code,
} from './check-app3-s11.sources.mjs';

const SOURCE_LIMIT = 400;
const TEST_LIMIT = 600;

/** One finger is the design, two are the camera — decided by count, not by guess. */
export function checkArbitration(rootDir, fail) {
  const touch = code(rootDir, 'touch');
  const gestures = code(rootDir, 'gestures');

  /*
   * The arbitration is one total function of the touch count.
   *
   * Stated once so the two callers cannot answer it differently, and decidable
   * the instant a finger lands rather than after enough movement to infer an
   * intent — being wrong here means moving a design the customer thought they
   * were only looking at.
   */
  if (!/gestureKindFor\(touchCount: number\)/.test(touch)) {
    fail(`${CANONICAL_FILES.touch}: the arbitration is not a function of the touch count`);
  }
  if (!/touchCount === 1 \? 'element' : 'viewport'/.test(touch)) {
    fail(`${CANONICAL_FILES.touch}: one finger is not the element and two are not the viewport`);
  }
  if (!/gestureKindFor\(touches\.current\.size\) === 'viewport'/.test(gestures)) {
    fail(`${CANONICAL_FILES.gestures}: the viewport gesture is not decided by the touch count`);
  }

  /*
   * The handoff, through `APP3-S03`'s own cancellation.
   *
   * A second finger landing during an element drag ends that drag. No `pointerup`
   * has been delivered for the first touch and none will be until the customer
   * lifts it, so without this the drag would keep following a finger that is now
   * half of a pinch.
   */
  if (!/transform\.cancelGesture\(\)/.test(gestures)) {
    fail(`${CANONICAL_FILES.gestures}: an element drag is not closed when the second finger lands`);
  }

  /*
   * Bound in the **capture** phase.
   *
   * `APP3-S03` stops propagation when a gesture starts on the move surface, so a
   * bubble-phase listener never sees a finger that landed on an element — and
   * would count one touch while two were down. A real phone finds this and a
   * desktop pointer never does.
   */
  if (!/onPointerDownCapture=\{touch\?\.onPointerDown\}/.test(code(rootDir, 'viewport'))) {
    fail(`${CANONICAL_FILES.viewport}: the touch arbitration cannot see a finger on an element`);
  }

  // Nothing survives the fingers: a stale pointer record makes the next single
  // tap look like the second finger of a pinch.
  if (!/touches\.current\.clear\(\)/.test(gestures)) {
    fail(`${CANONICAL_FILES.gestures}: live pointers are not released on unmount`);
  }
  if (!/touches\.current\.delete\(event\.pointerId\)/.test(gestures)) {
    fail(`${CANONICAL_FILES.gestures}: a lifted or cancelled contact is never forgotten`);
  }
}

/** A pinch chooses a step, never a scale. */
export function checkPinch(rootDir, fail) {
  const touch = code(rootDir, 'touch');
  const gestures = code(rootDir, 'gestures');

  /*
   * `ADR-APP0-001` measured its 41 ms WebKit p95 *by driving a continuous pinch*,
   * and `APP3-S07` answered by making zoom an index into a frozen list. The
   * gesture that produced the number does not get an exception: the pinch
   * resolves to a step index and the store is told a step.
   */
  /*
   * Anchored on what the pinch **returns**, not on the helper existing.
   *
   * A rule that only asked whether `nearestStep` was defined would still read
   * its own declaration after the pinch stopped calling it — a helper nothing
   * uses is a comment, and the gate would pass on a function that handed back a
   * raw scale.
   */
  if (!/return nearestStep\(target\);/.test(touch)) {
    fail(`${CANONICAL_FILES.touch}: a pinch does not resolve to a frozen zoom step`);
  }
  if (!/ZOOM_STEPS/.test(touch)) {
    fail(`${CANONICAL_FILES.touch}: the pinch does not read the accepted APP3-S07 zoom list`);
  }
  if (!/setZoomStep\(\s*pinchStepFor\(/.test(gestures)) {
    fail(`${CANONICAL_FILES.gestures}: the pinch does not drive the viewport by step`);
  }
  // The store still takes an index and clamps it. A setter that accepted a scale
  // would make an arbitrary one representable again.
  const store = code(rootDir, 'viewportStore');
  if (!/setZoomStep: \(zoomStep\) =>/.test(store) || !/clampStep\(zoomStep\)/.test(store)) {
    fail(`${CANONICAL_FILES.viewportStore}: the zoom setter does not take a clamped step index`);
  }
  for (const scale of [/zoomStep \* /, /zoom \*= /, /scale: ratio/]) {
    if (scale.test(featureCode(rootDir))) {
      fail(`${FEATURE}: a viewport scale is computed rather than chosen (${String(scale)})`);
    }
  }

  // Frozen start, total ratio — the same discipline a drag uses.
  if (!/startSeparationPx/.test(touch) || !/separationPx \/ startSeparationPx/.test(touch)) {
    fail(`${CANONICAL_FILES.touch}: the pinch ratio is not measured from the gesture's start`);
  }
}

/** A viewport gesture touches the camera and nothing else. */
export function checkViewportOnly(rootDir, fail) {
  const gestures = code(rootDir, 'gestures');

  // The whole file may reach the viewport store and no document seam at all.
  for (const forbidden of [
    'useStudioDocumentStore',
    'commit(',
    'beginAction',
    'endAction',
    'recordAction',
    'quantizeDesignDocument',
  ]) {
    if (gestures.includes(forbidden)) {
      fail(`${CANONICAL_FILES.gestures}: a viewport gesture reaches the document (${forbidden})`);
    }
  }
  if (!/panByPixels\(/.test(gestures)) {
    fail(`${CANONICAL_FILES.gestures}: the two-finger pan does not drive the accepted store`);
  }
  // A pointer object may never reach a store: both stores say so, and a pinch is
  // where one would first be tempting.
  for (const store of ['viewportStore', 'touch']) {
    if (/PointerEvent/.test(code(rootDir, store))) {
      fail(`${CANONICAL_FILES[store]}: a PointerEvent reached a store or a pure model`);
    }
  }
}

/** The numeric transform is a button path into the accepted authority. */
export function checkTransformSheet(rootDir, fail) {
  const sheet = code(rootDir, 'transformSheet');
  const model = code(rootDir, 'mobileTransform');

  // Every press is ruled on by `APP3-P02`, exactly as a drag is.
  if (!/ruleOnCandidate\(/.test(sheet) || !/withTransform\(/.test(sheet)) {
    fail(`${CANONICAL_FILES.transformSheet}: a press does not go through the APP3-P02 authority`);
  }
  if (!/if \(!outcome\.ok\)[\s\S]{0,200}return;/.test(sheet)) {
    fail(`${CANONICAL_FILES.transformSheet}: a refused candidate is not abandoned`);
  }
  // `IMP-D045` PO-09 forbids all four repairs, and a numeric control is exactly
  // where they would look reasonable.
  for (const repair of ['Math.min(', 'Math.max(', 'clamp', 'snap']) {
    if (sheet.includes(repair)) {
      fail(`${CANONICAL_FILES.transformSheet}: a refused candidate is repaired (${repair})`);
    }
  }
  // The size buttons write scale, because `IMP-D045` PO-04 makes scale the
  // persisted resize model and two of the five kinds ignore a width field.
  if (!/scaleX: start\.scaleX \* factor/.test(model)) {
    fail(
      `${CANONICAL_FILES.mobileTransform}: a millimetre button writes something other than scale`,
    );
  }
  // The read-out is measured, never echoed.
  if (!/getElementBounds\(/.test(model) || !/sizePxToMm\(/.test(model)) {
    fail(`${CANONICAL_FILES.mobileTransform}: the millimetre read-out is not measured by APP3-P02`);
  }
  if (!/measuredSizeMm\(document, element\.id, graph, scope\.pxPerMm\)/.test(sheet)) {
    fail(`${CANONICAL_FILES.transformSheet}: the read-out is not re-measured from the document`);
  }
  // Hidden and locked keep the desktop bar, not a softer mobile one.
  if (!/element\.visible && !element\.locked/.test(sheet)) {
    fail(`${CANONICAL_FILES.transformSheet}: a hidden or locked element may be transformed`);
  }
}

/** One sheet primitive, modal, and a conflict that may not be dismissed. */
export function checkSheets(rootDir, fail) {
  const sheet = code(rootDir, 'sheet');
  const surface = code(rootDir, 'surface');

  for (const required of [
    'role="dialog"',
    'aria-modal="true"',
    'aria-labelledby={headingId}',
    'document.body.style.overflow',
  ]) {
    if (!sheet.includes(required)) {
      fail(`${CANONICAL_FILES.sheet}: the sheet is not a modal dialog (${required})`);
    }
  }
  // Focus enters, is contained both ways, and returns to the invoking control.
  if (!/opener\.current\?\.focus\(\)/.test(sheet)) {
    fail(`${CANONICAL_FILES.sheet}: focus does not return to the control that opened the sheet`);
  }
  if (!/event\.shiftKey && document\.activeElement === first/.test(sheet)) {
    fail(`${CANONICAL_FILES.sheet}: Shift+Tab is not contained, so focus escapes backwards`);
  }
  if (!/event\.key === 'Escape' && dismissible/.test(sheet)) {
    fail(`${CANONICAL_FILES.sheet}: Escape closes a sheet that may not be dismissed`);
  }
  // A clickable div has no role, no name and no keyboard. The scrim is a button.
  if (/<div[^>]*onClick=/.test(sheet)) {
    fail(`${CANONICAL_FILES.sheet}: the scrim is a clickable div`);
  }
  // The conflict decision may not be left by any third way.
  if (!/dismissible=\{false\}/.test(surface)) {
    fail(`${CANONICAL_FILES.surface}: the conflict sheet can be dismissed`);
  }
  if (!/dismissible \? \(/.test(sheet)) {
    fail(`${CANONICAL_FILES.sheet}: a sheet that may not be closed still draws a close control`);
  }
  // At most one sheet, ever: two stacked over a 390 stage trap focus in the one
  // the customer cannot see.
  const sheets = code(rootDir, 'sheets');
  if (!/useState<StudioSheetName \| null>\(null\)/.test(sheets)) {
    fail(`${CANONICAL_FILES.sheets}: more than one sheet can be open at once`);
  }
}

/** The conflict decision appears once, and stays `APP3-S10`'s. */
export function checkConflictProjection(rootDir, fail) {
  const surface = code(rootDir, 'surface');
  const saveState = code(rootDir, 'saveState');
  const screen = code(rootDir, 'stageScreen');

  // Exactly the two actions `610:118` authorized, reached from S10's controller.
  for (const action of ['save.loadLatest', 'save.keepLocal']) {
    if (!surface.includes(action)) {
      fail(`${CANONICAL_FILES.surface}: the conflict sheet does not offer ${action}`);
    }
  }
  for (const invented of ['merge', 'Merge', 'saveAsCopy', 'resolveAutomatically']) {
    if (surface.includes(invented)) {
      fail(`${CANONICAL_FILES.surface}: the conflict sheet invents a third way out (${invented})`);
    }
  }
  // Relocated, not duplicated. Two surfaces asking the same question with the
  // same two buttons is how a customer comes to believe they are two questions.
  if (!/suppressConflict/.test(saveState) || !/conflict && suppressConflict/.test(saveState)) {
    fail(`${CANONICAL_FILES.saveState}: the desktop conflict region is not suppressed at 390`);
  }
  if (!/suppressConflict=\{mobile\}/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the mobile tier does not suppress the desktop conflict`);
  }
  // The cadence stays exactly where `APP3-S10` left it.
  const all = featureCode(rootDir);
  for (const owned of [
    'AUTOSAVE_DEBOUNCE_MS = ',
    'AUTOSAVE_MAX_DIRTY_AGE_MS = ',
    'AUTOSAVE_RETRY_DELAYS_MS',
  ]) {
    if (!all.includes(owned)) {
      fail(`${FEATURE}: the accepted APP3-S10 cadence constant ${owned} is gone`);
    }
  }
  for (const forbidden of ['mobileAutosave', 'touchAutosave', 'sheetAutosave']) {
    if (all.includes(forbidden)) {
      fail(`${FEATURE}: the mobile UI calls autosave directly (${forbidden})`);
    }
  }
  if (s11Code(rootDir).includes('publicDesignSessionAutosave')) {
    fail(`${FEATURE}: a mobile surface saves for itself instead of through APP3-S10`);
  }
}

/** The 390 composition, and nothing of it anywhere else. */
export function checkComposition(rootDir, fail) {
  const screen = code(rootDir, 'stageScreen');
  const toolbar = code(rootDir, 'toolbar');
  const outside = outsideS11Code(rootDir);

  // Mounted by tier, not hidden by CSS: a hidden control is still focusable and
  // still fires, so a media query would leave two tiers' tools live at once.
  if (!/useStudioViewportTier\(\)/.test(screen) || !/tier === 'mobile'/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the mobile composition is not decided by tier`);
  }
  if (!/\{mobile \? \(\s*<StudioMobileSurface/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the mobile surface is not mounted at the mobile tier`);
  }
  for (const hidden of ['display: none', 'visibility: hidden']) {
    if (s11Code(rootDir).includes(hidden)) {
      fail(`${FEATURE}: a mobile surface is hidden rather than not rendered (${hidden})`);
    }
  }
  // One toolbar, and it is the only one. A second would be a second answer to
  // "where are the tools".
  if ((outside.match(/studio-mobile-toolbar/g) ?? []).length > 0) {
    fail(`${FEATURE}: a second mobile toolbar exists outside the checkpoint that owns one`);
  }
  // `APP3-S05` is edit-only; a toolbar button that created text would be that
  // decision taken here rather than by the checkpoint that owns it.
  for (const create of ['addText', 'createText', 'onAddText']) {
    if (s11Code(rootDir).includes(create)) {
      fail(`${CANONICAL_FILES.toolbar}: the text tool became a create control (${create})`);
    }
  }
  if (!/disabled=\{!canEditText\}/.test(toolbar)) {
    fail(`${CANONICAL_FILES.toolbar}: the text tool is not disabled without an editable selection`);
  }
  // No group, still: `IMP-D045` PO-07 defers the frame that would authorize one.
  for (const group of ['ungroup', 'onGroup', 'groupSelection']) {
    if (featureCode(rootDir).includes(group)) {
      fail(`${FEATURE}: a group control arrived without authority (${group})`);
    }
  }
}

/** Every control a finger has to hit, and every name a screen reader needs. */
export function checkTargets(rootDir, fail) {
  const styles = read(rootDir, 'styles') ?? '';

  /*
   * The 44 px floor, bound to the shared token rather than typed as a number.
   *
   * `610:294` prints the promise in words — *"Vùng chạm tối thiểu 44 px cho mọi
   * điều khiển"* — and a note is only true if the build makes it true.
   */
  for (const rule of [
    '.studio-mobile-toolbar__control',
    '.studio-transform-sheet__step',
    '.studio-sheet__close',
  ]) {
    const block = styles.slice(styles.indexOf(rule), styles.indexOf(rule) + 600);
    if (!block.includes('$size-touch-target-min')) {
      fail(`${CANONICAL_FILES.styles}: ${rule} is not bound to the shared touch-target minimum`);
    }
  }
  // The browser's own pan and pinch are suppressed on the stage surface only.
  if (
    !/\.studio-stage__viewport\[data-touch='true'\][\s\S]{0,200}touch-action: none/.test(styles)
  ) {
    fail(`${CANONICAL_FILES.styles}: the stage does not claim the touch gestures it answers`);
  }
  if (/^\s*(body|html|\*)[\s\S]{0,120}touch-action: none/m.test(styles)) {
    fail(`${CANONICAL_FILES.styles}: page scrolling is disabled globally`);
  }
  // A glyph is not a name.
  const toolbar = code(rootDir, 'toolbar');
  if (!/aria-label=\{label\}/.test(toolbar)) {
    fail(`${CANONICAL_FILES.toolbar}: a toolbar control carries no accessible name`);
  }
  for (const glyph of ['↶', '↷', '⋯', '⋮⋮']) {
    if (publishedValues(read(rootDir, 'copy') ?? '').includes(glyph)) {
      fail(`${CANONICAL_FILES.copy}: "${glyph}" is published as a name rather than as decoration`);
    }
  }
}

/** The keyboard inset is measured, never assumed. */
export function checkKeyboard(rootDir, fail) {
  const keyboard = code(rootDir, 'keyboard');

  if (!/window\.visualViewport/.test(keyboard)) {
    fail(`${CANONICAL_FILES.keyboard}: the keyboard inset is not measured from VisualViewport`);
  }
  // Never a constant: keyboard heights differ by device, language and keyboard,
  // so any number hard-coded here is wrong on most phones.
  if (!/window\.innerHeight - \(viewport\.height \+ viewport\.offsetTop\)/.test(keyboard)) {
    fail(`${CANONICAL_FILES.keyboard}: the inset is assumed rather than measured`);
  }
  if (!/removeEventListener/.test(keyboard)) {
    fail(`${CANONICAL_FILES.keyboard}: the VisualViewport listeners are never removed`);
  }
  if (!/if \(!viewport\) return;/.test(keyboard)) {
    fail(`${CANONICAL_FILES.keyboard}: a browser without VisualViewport is not handled`);
  }
}

/** One renderer, one watermark, no export — unchanged by a phone. */
export function checkUntouched(rootDir, fail) {
  const all = featureCode(rootDir);

  const canvases = all.split('<svg').length - 1;
  if (canvases !== 1) {
    fail(`${FEATURE}: opens ${String(canvases)} <svg> roots, expected exactly 1`);
  }
  if (all.includes('<canvas')) fail(`${FEATURE}: renders a canvas`);
  for (const watermark of ['StudioStageWatermark', 'mintWatermarkToken']) {
    if (!all.includes(watermark)) {
      fail(`${FEATURE}: the APP3-S09 watermark is no longer rendered (${watermark})`);
    }
  }
  for (const exportish of ['download', 'toDataURL', 'toBlob(', 'saveAs']) {
    if (all.includes(exportish)) fail(`${FEATURE}: an export path arrived (${exportish})`);
  }
  for (const engine of ['hammerjs', 'react-zoom-pan-pinch', 'interactjs', 'use-gesture']) {
    if (new RegExp(`from '${engine}'`).test(all)) {
      fail(`${FEATURE}: imports the gesture engine "${engine}"`);
    }
  }
}

/** The artifacts a frontend checkpoint must not move. */
export function checkImmutability(rootDir, fail) {
  const openapi = read(rootDir, 'openapi');
  if (openapi === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }
  const document = JSON.parse(openapi);
  const paths = Object.keys(document.paths ?? {}).length;
  const operations = Object.values(document.paths ?? {}).reduce(
    (total, path) => total + Object.keys(path).length,
    0,
  );
  const schemas = Object.keys(document.components?.schemas ?? {}).length;
  if (paths !== EXPECTED_PATHS) fail(`${CANONICAL_FILES.openapi}: ${String(paths)} paths`);
  if (operations !== EXPECTED_OPERATIONS) {
    fail(`${CANONICAL_FILES.openapi}: ${String(operations)} operations`);
  }
  if (schemas !== EXPECTED_SCHEMAS) fail(`${CANONICAL_FILES.openapi}: ${String(schemas)} schemas`);

  const migrations = collect(join(rootDir, MIGRATIONS), /\.sql$/).length;
  if (migrations !== EXPECTED_MIGRATIONS) {
    fail(
      `${MIGRATIONS}: ${String(migrations)} migrations, expected ${String(EXPECTED_MIGRATIONS)}`,
    );
  }
  const rootPackage = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  const scripts = Object.keys(rootPackage.scripts ?? {}).length;
  if (scripts !== ROOT_SCRIPTS) {
    fail(
      `${CANONICAL_FILES.rootPackage}: ${String(scripts)} scripts, expected ${String(ROOT_SCRIPTS)}`,
    );
  }
  // No dependency: every gesture here is Pointer Events and arithmetic.
  const storefront = JSON.parse(read(rootDir, 'storefrontPackage') ?? '{}');
  for (const name of Object.keys(storefront.dependencies ?? {})) {
    if (/gesture|hammer|pinch|zoom|touch/i.test(name)) {
      fail(`${CANONICAL_FILES.storefrontPackage}: a gesture dependency was added (${name})`);
    }
  }
  // The cadence `APP3-S10` locked, read from this checkpoint's own view of it.
  const autosave = code(rootDir, `${FEATURE}/model/studio-autosave.ts`);
  if (!autosave.includes(`AUTOSAVE_DEBOUNCE_MS = ${String(DEBOUNCE_MS)}`)) {
    fail(`${FEATURE}: the accepted autosave debounce moved`);
  }
  if (!autosave.includes(`AUTOSAVE_MAX_DIRTY_AGE_MS = ${String(MAX_DIRTY_AGE_MS / 1000)}_000`)) {
    fail(`${FEATURE}: the accepted autosave ceiling moved`);
  }
}

/** Every file inside the limits `CLAUDE.md` §6 fixes. */
export function checkFileSizes(rootDir, fail) {
  const sources = collect(join(rootDir, FEATURE), /\.tsx?$/);
  for (const path of sources) {
    const lines = (read(rootDir, path.slice(rootDir.length + 1).replaceAll('\\', '/')) ?? '').split(
      '\n',
    ).length;
    if (lines > SOURCE_LIMIT) {
      fail(`${path}: ${String(lines)} lines, over the ${String(SOURCE_LIMIT)}-line source maximum`);
    }
  }
  const tests = collect(join(rootDir, 'apps/storefront/test'), /studio-mobile|studio-touch/);
  for (const path of tests) {
    const lines = (read(rootDir, path.slice(rootDir.length + 1).replaceAll('\\', '/')) ?? '').split(
      '\n',
    ).length;
    if (lines > TEST_LIMIT) {
      fail(`${path}: ${String(lines)} lines, over the ${String(TEST_LIMIT)}-line test maximum`);
    }
  }
}
