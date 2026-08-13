/**
 * `APP3-S07` — the runtime rules: where the viewport transform is applied, what
 * the zoom may be, what the viewport state may hold, and which capabilities the
 * stage must not grow now that it can follow a pointer.
 *
 * The rules worth a machine are the ones that stay green while being wrong. A
 * zoom that multiplies every element's transform draws a correct-looking picture
 * whose every coordinate has left the document. A scene rebuilt on each zoom
 * step looks identical and costs the whole adapter per click. A safe-area toggle
 * that recomputes the rectangle rather than withholding it agrees with the
 * persisted one on every fixture and diverges on the rounded ones nobody wrote.
 * A `zoom *= 1.1` returns to 0.9999999999999999 and never to 1. And a wheel
 * handler restores, in one line, precisely the continuous-scale path
 * `ADR-APP0-001` measured at 41 ms p95 on WebKit.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isS04Delivered,
  isS06Delivered,
  isS09Delivered,
  isS10Delivered,
  isS11Delivered,
} from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  FEATURE,
  FORBIDDEN_ENGINES,
  code,
  collect,
  featureCode,
  preS06Code,
  preS07Code,
  read,
  s07Code,
  preS04Code,
  preS09Code,
  preS11Code,
} from './check-app3-s07.sources.mjs';

/**
 * Ways to produce a scale that is not one of the frozen steps. The mitigation
 * is not "zoom is cheaper now" — it is that an arbitrary scale cannot be
 * represented, and each of these puts one back.
 */
const CONTINUOUS_SCALE = Object.freeze([
  /zoom\s*\*=/,
  /zoom\s*\*\s*1\.\d/,
  /Math\.pow\(/,
  /\*\*\s*zoom/,
  /deltaY\s*\*/,
  /scale\s*\*=/,
]);

/** Storage a runtime viewport must never reach. */
const PERSISTENCE = Object.freeze([
  'localStorage',
  'sessionStorage',
  'document.cookie',
  'persist(',
  'history.pushState',
  'history.replaceState',
  'useSearchParams',
]);

/** One transformed wrapper outside one untouched scene. */
export function checkViewportBoundary(rootDir, fail) {
  for (const key of ['viewportModel', 'viewportStore', 'viewport', 'controls']) {
    if (!existsSync(join(rootDir, CANONICAL_FILES[key]))) {
      fail(`${CANONICAL_FILES[key]}: missing`);
    }
  }

  const all = featureCode(rootDir);
  // `APP3-S02`'s invariant, restated here because a viewport is exactly how a
  // second scene arrives: a scaled copy behind the real one draws perfectly.
  const canvases = all.split('<svg').length - 1;
  if (canvases !== 1) {
    fail(`${FEATURE}: opens ${String(canvases)} <svg> roots, expected exactly 1`);
  }
  if (all.includes('<canvas')) fail(`${FEATURE}: renders a canvas`);

  for (const engine of FORBIDDEN_ENGINES) {
    if (new RegExp(`from '${engine}'|require\\('${engine}'`).test(all)) {
      fail(`${FEATURE}: imports the rendering/interaction engine "${engine}"`);
    }
  }

  // The transform exists, is produced in one place, and is applied in one.
  const model = code(rootDir, 'viewportModel');
  if (!model.includes('viewportTransform')) {
    fail(`${CANONICAL_FILES.viewportModel}: publishes no viewport transform`);
  }
  const viewport = code(rootDir, 'viewport');
  if (!viewport.includes('viewportTransform(')) {
    fail(`${CANONICAL_FILES.viewport}: does not apply the model's transform`);
  }
  const appliers = all.split('viewportTransform(').length - 1;
  // Twice: the model's own definition, and the one component that applies it.
  if (appliers > 2) {
    fail(
      `${FEATURE}: applies the viewport transform in ${String(appliers - 1)} places, expected 1`,
    );
  }
}

/**
 * The scene is untouched by the viewport.
 *
 * The strongest available form of "zoom does not reach the document": the
 * adapter, the SVG, the element component and the selection outline may not
 * contain the word at all. A zoom they cannot see is a zoom they cannot
 * multiply into a matrix, and a scene that cannot see it cannot be rebuilt by
 * it.
 */
export function checkSceneUntouched(rootDir, fail) {
  for (const key of ['scene', 'stage', 'stageElement', 'stageSelection']) {
    const source = code(rootDir, key);
    for (const viewportWord of ['zoom', 'panX', 'panY', 'viewportTransform']) {
      if (source.includes(viewportWord)) {
        fail(`${CANONICAL_FILES[key]}: knows about the viewport (${viewportWord})`);
      }
    }
  }

  // The viewBox is still the document's own placement canvas. A zoom multiplied
  // into it is the continuous-scale path with extra steps.
  if (
    !/viewBox=\{`0 0 \$\{String\(scene\.canvasWidthPx\)\} \$\{String\(scene\.canvasHeightPx\)\}`\}/.test(
      code(rootDir, 'stage'),
    )
  ) {
    fail(`${CANONICAL_FILES.stage}: the viewBox is no longer the document placement canvas`);
  }

  // The scene is memoised on the document alone. A viewport in that dependency
  // list re-runs the whole adapter on every zoom step — the exact cost the
  // discrete-step mitigation exists to avoid, and invisible on screen.
  const screen = code(rootDir, 'stageScreen');
  // `APP3-S03-C1` added a second argument — the previous build, offered back so
  // unchanged elements keep their identity. The dependency list is what this
  // rule is about, and it is still the document alone.
  if (
    !/useMemo\(\s*\(\)\s*=>\s*buildRenderableScene\(stageDocument[^)]*\),\s*\[stageDocument\],?\s*\)/.test(
      screen,
    )
  ) {
    fail(`${CANONICAL_FILES.stageScreen}: the scene is not memoised on the document alone`);
  }
  if (/buildRenderableScene[\s\S]{0,200}zoom/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: rebuilds the scene for a viewport change`);
  }

  // No geometry is composed for the viewport either. The transform is a CSS
  // translate and scale, not a matrix anyone here multiplied.
  for (const local of [
    /Math\.(cos|sin|tan|atan2)\(/,
    /Math\.PI/,
    /composeMatrices\(/,
    /DOMMatrix/,
  ]) {
    if (local.test(s07Code(rootDir))) {
      fail(`${FEATURE}: the viewport composes geometry (${String(local)})`);
    }
  }
}

/** A finite, ordered, deterministic zoom — the WebKit mitigation itself. */
export function checkZoom(rootDir, fail) {
  const model = code(rootDir, 'viewportModel');
  if (!model.includes('ZOOM_STEPS')) {
    fail(`${CANONICAL_FILES.viewportModel}: publishes no finite zoom set`);
  }
  if (!/ZOOM_STEPS[^=]*=\s*Object\.freeze\(\[/.test(model)) {
    fail(`${CANONICAL_FILES.viewportModel}: the zoom set is not frozen`);
  }
  for (const bound of ['clampStep', 'canZoomIn', 'canZoomOut']) {
    if (!model.includes(bound)) {
      fail(`${CANONICAL_FILES.viewportModel}: the zoom is unbounded (${bound} is missing)`);
    }
  }
  // Pan is clamped to the interval that keeps the content covering the frame,
  // and the fitted step is the one where that interval is a single value.
  for (const bound of ['clampPan', 'panLimit', 'FIT_STEP']) {
    if (!model.includes(bound)) {
      fail(`${CANONICAL_FILES.viewportModel}: the pan is unbounded (${bound} is missing)`);
    }
  }

  const all = featureCode(rootDir);
  for (const continuous of CONTINUOUS_SCALE) {
    if (continuous.test(all)) {
      fail(`${FEATURE}: restores an arbitrary continuous scale (${String(continuous)})`);
    }
  }
  // A wheel is a continuous gesture by nature, and the approved design draws
  // stepped controls rather than one.
  for (const gesture of ['onWheel', 'onScroll', 'wheel']) {
    if (all.includes(gesture)) {
      fail(`${FEATURE}: carries "${gesture}", which is a continuous zoom the ADR measured`);
    }
  }
  // Every control is a real button with a name; the disabled ends are stated.
  const controls = code(rootDir, 'controls');
  for (const required of ['canZoomIn(', 'canZoomOut(', 'disabled', 'aria-pressed']) {
    if (!controls.includes(required)) {
      fail(`${CANONICAL_FILES.controls}: does not expose ${required}`);
    }
  }
  if (/<input[^>]*type="range"/.test(controls) || controls.includes('<select')) {
    fail(`${CANONICAL_FILES.controls}: offers a control the approved design does not draw`);
  }
}

/** Runtime-only viewport state, separated from the document and from selection. */
export function checkViewportState(rootDir, fail) {
  // The shape is defined once, in the model, and the store extends it rather
  // than re-declaring it — so the two cannot drift into disagreeing about what
  // a viewport is.
  const model = code(rootDir, 'viewportModel');
  for (const required of ['zoomStep', 'panXRatio', 'panYRatio']) {
    if (!model.includes(required)) {
      fail(`${CANONICAL_FILES.viewportModel}: defines no ${required}`);
    }
  }
  const store = code(rootDir, 'viewportStore');
  for (const required of ['StudioViewport', 'safeAreaVisible', 'resetViewport']) {
    if (!store.includes(required)) {
      fail(`${CANONICAL_FILES.viewportStore}: holds no ${required}`);
    }
  }
  for (const forbidden of [
    'SVGElement',
    'HTMLElement',
    'DOMRect',
    'DOMMatrix',
    'AbortController',
    'Blob',
    'objectUrl',
    'sessionId',
    'snapshot',
    'document:',
    'elements',
    'useRef',
    'requestAnimationFrame',
  ]) {
    if (store.includes(forbidden)) {
      fail(
        `${CANONICAL_FILES.viewportStore}: keeps ${forbidden}, which is not serializable viewport state`,
      );
    }
  }
  // Nothing later in the phase is pre-built here either.
  for (const early of ['history', 'undo', 'redo', 'layers', 'upload', 'watermark', 'draft']) {
    if (store.includes(early)) {
      fail(`${CANONICAL_FILES.viewportStore}: pre-builds ${early} state a later checkpoint owns`);
    }
  }

  // The selection store stayed exactly as `APP3-S02` left it. Two stores that
  // cannot express each other's concern is why S02's rule never had to bend.
  const selection = code(rootDir, 'selectionStore');
  for (const viewportWord of ['zoom', 'pan', 'safeArea']) {
    if (selection.includes(viewportWord)) {
      fail(`${CANONICAL_FILES.selectionStore}: the selection store grew viewport state`);
    }
  }

  for (const persistence of PERSISTENCE) {
    if (s07Code(rootDir).includes(persistence)) {
      fail(`${FEATURE}: persists viewport state (${persistence})`);
    }
  }
  // A viewport carried into a different Session points the camera at
  // coordinates that mean something else there.
  if (!code(rootDir, 'stageScreen').includes('resetViewport')) {
    fail(`${CANONICAL_FILES.stageScreen}: the viewport is not reset for a new Session`);
  }
  if (!/resetViewport[\s\S]{0,120}snapshot\.sessionId/.test(code(rootDir, 'stageScreen'))) {
    fail(`${CANONICAL_FILES.stageScreen}: the viewport reset is not bound to the Session identity`);
  }
}

/** The document, the network and the capabilities a viewport must not touch. */
/** The markers `APP3-S11` legitimately owns once it has opened. */
const MOVED_TO_S11 = new Set(['pinch', 'gesturestart']);

export function checkNonScope(rootDir, fail) {
  const all = featureCode(rootDir);
  const s07 = s07Code(rootDir);

  // The viewport reaches no server. Not a query, not a mutation, not a client.
  for (const call of ['useQuery', 'useMutation', '@embroidery/api-client', 'axios']) {
    if (s07.includes(call)) {
      fail(`${FEATURE}: the viewport reaches the network (${call})`);
    }
  }
  // World-aware from `APP3-S10`. The half that mattered is unchanged and is
  // asserted above against `s07Code`: the viewport reaches no server at all.
  if (!isS10Delivered(rootDir) && all.includes('publicDesignSessionAutosave')) {
    fail(`${FEATURE}: autosaves, which is APP3-S10's`);
  }
  if (all.includes('publicProductMediaGet')) {
    fail(`${FEATURE}: reaches publicProductMediaGet, which S07 does not own`);
  }
  // The Session-media ban, world-aware (`APP3-S06`). It was written when no
  // checkpoint owned the image capability; S06 owns it now, so the ban moves to
  // every file S06 did not introduce rather than disappearing — which is what
  // keeps the viewport a viewport.
  const outsideS06 = isS06Delivered(rootDir) ? preS06Code(rootDir) : all;
  if (outsideS06.includes('publicDesignSessionAsset')) {
    fail(`${FEATURE}: reaches publicDesignSessionAsset, which S07 does not own`);
  }

  // The background query key contains no viewport state, so moving the view
  // cannot be a reason to fetch the Side's bytes again.
  for (const key of ['queryKeys', 'backgroundHook']) {
    for (const viewportWord of ['zoom', 'panX', 'safeArea']) {
      if (code(rootDir, key).includes(viewportWord)) {
        fail(`${CANONICAL_FILES[key]}: the background depends on the viewport (${viewportWord})`);
      }
    }
  }

  /*
   * The drag markers moved owner rather than losing their rule (`APP3-S04`).
   *
   * `608:68` draws a drag-reorder in the layer panel, so once `APP3-S04` has
   * delivered the marker is legitimate **in its six files** — and as forbidden
   * as it ever was in the viewport, the stage and everywhere else, which is what
   * this rule protects.
   */
  const dragScope = isS04Delivered(rootDir) ? preS04Code(rootDir) : all;
  for (const marker of ['onDragStart', 'onDragEnd', 'draggable']) {
    if (dragScope.includes(marker)) {
      fail(`${FEATURE}: carries "${marker}" outside the layer panel that owns it`);
    }
  }

  const owners = Object.freeze({
    onMouseMove: 'APP3-S03',
    resizeHandle: 'APP3-S03',
    rotateHandle: 'APP3-S03',
    onTouchStart: 'APP3-S11',
    onTouchMove: 'APP3-S11',
    pinch: 'APP3-S11',
    gesturestart: 'APP3-S11',
    undoStack: 'APP3-S08',
    redoStack: 'APP3-S08',
  });
  /*
   * The watermark moved owner rather than losing its rule (`APP3-S09`).
   *
   * It was banned feature-wide while S09 had not opened. It now has, so the
   * mark is legitimate in its four files — and as forbidden as ever in the
   * stage, the viewport and the transform chrome, which is what this rule was
   * written to protect.
   */
  const watermarkScope = isS09Delivered(rootDir) ? preS09Code(rootDir) : all;
  for (const construction of ['studio-watermark__', 'mintWatermarkToken', 'watermarkTiles(']) {
    if (watermarkScope.includes(construction)) {
      fail(`${FEATURE}: builds a watermark outside the four files APP3-S09 owns`);
    }
  }

  /*
   * The touch markers moved owner rather than losing their rule (`APP3-S11`).
   *
   * Each was banned feature-wide while S11 had not opened. It now has, so a
   * pinch is legitimate in the eleven files that checkpoint owns — and as
   * forbidden as ever everywhere else, which is what this rule was written to
   * protect. `onTouchStart` and `onTouchMove` stay banned even inside S11: the
   * arbitration is built on Pointer Events, and a second input model beside it
   * has its own capture rules and its own way of losing a contact.
   */
  const touchScope = isS11Delivered(rootDir) ? preS11Code(rootDir) : all;
  for (const [marker, owner] of Object.entries(owners)) {
    const scope = MOVED_TO_S11.has(marker) ? touchScope : all;
    if (scope.includes(marker)) {
      fail(`${FEATURE}: carries "${marker}", a capability ${owner} owns`);
    }
  }
  // The pan is refused for a touch pointer explicitly, rather than by omission.
  if (!code(rootDir, 'viewport').includes("pointerType === 'touch'")) {
    fail(`${CANONICAL_FILES.viewport}: a touch pointer is not refused, which is APP3-S11's`);
  }

  // No document mutation of any kind. Anchored on the document, because the
  // viewport legitimately builds state objects of its own.
  for (const mutation of [
    /\.transform\.x\s*=[^=]/,
    /\.transform\.y\s*=[^=]/,
    /\.rotationDeg\s*=[^=]/,
    /\.scaleX\s*=[^=]/,
    /document\.elements\s*=/,
    /document\.elements\.(push|splice|sort|reverse)\(/,
    /snapshot\.document\s*=/,
    /placement\.canvasWidthPx\s*=/,
  ]) {
    if (mutation.test(all)) {
      fail(`${FEATURE}: mutates the Design Document (${String(mutation)})`);
    }
  }
}

/** The safe area is the persisted rectangle, shown or withheld. */
export function checkSafeArea(rootDir, fail) {
  const screen = code(rootDir, 'stageScreen');
  // Withheld from the paint, not recomputed: the same `rectToBounds` answer
  // either way. A locally derived second boundary would agree on every fixture
  // and diverge on the rounded ones nobody wrote.
  if (!/safeAreaVisible \? area : null/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the safe area is not the persisted rectangle, withheld`);
  }
  if (!screen.includes('rectToBounds(')) {
    fail(`${CANONICAL_FILES.stageScreen}: the safe area is not taken from the engine`);
  }
  /*
   * The safe-area derivation ban, world-aware (`APP3-S11`).
   *
   * `inset` was banned across the feature because the embroidery area is the
   * persisted rectangle and nothing may compute a second one from it. That is
   * unchanged everywhere the rule was written about — and `APP3-S11` uses the
   * word for something else entirely: the **keyboard inset**, a measurement of
   * how far the on-screen keyboard covers the window, which is not a boundary,
   * not derived from the area and never reaches a document.
   *
   * So the scope narrows to everything outside the eleven files S11 owns rather
   * than the ban being dropped: a second area boundary computed in the stage,
   * the viewport or an inspector still fails exactly as before.
   */
  const all = featureCode(rootDir);
  const areaScope = isS11Delivered(rootDir) ? preS11Code(rootDir) : all;
  for (const derived of [/inset/i, /margin[A-Z]/, /shrinkBy/, /padArea/]) {
    if (derived.test(areaScope)) {
      fail(`${FEATURE}: derives a second safe-area boundary (${String(derived)})`);
    }
  }
  // The boundary is inside the one SVG, so it shares the scene's coordinate
  // system and cannot drift from the artwork at any zoom.
  if (!code(rootDir, 'stage').includes('studio-stage__area')) {
    fail(`${CANONICAL_FILES.stage}: the area boundary left the scene`);
  }
  const styles = read(rootDir, 'styles') ?? '';
  if (!styles.includes('.studio-stage__viewport-layer')) {
    fail(`${CANONICAL_FILES.styles}: no viewport layer is styled`);
  }
  if (!/\.studio-stage__viewport-layer\s*\{[^}]*transform-origin:\s*0 0/.test(styles)) {
    fail(`${CANONICAL_FILES.styles}: the viewport layer has no top-left transform origin`);
  }
  if (!/\.studio-stage__viewport\s*\{[^}]*overflow:\s*hidden/.test(styles)) {
    fail(`${CANONICAL_FILES.styles}: the viewport does not clip, so a zoom scrolls the page`);
  }
}

/** The predecessor gate S07 had to evolve, and the way it had to evolve. */
export function checkPredecessorGate(rootDir, fail) {
  // Every module of the S02 gate, not one named file. `APP3-B04A` recorded this
  // exact defect: a rule anchored to a path stops asserting anything the moment
  // that file is split — and this checkpoint split it, moving the ban lists into
  // a module of their own. Reading the family survives the next split too.
  const s02 = collect(join(rootDir, 'tools'), /^check-app3-s02.*\.mjs$/)
    .filter((path) => !path.endsWith('.test.mjs'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  if (s02 === '') fail('tools/check-app3-s02*.mjs: the predecessor gate is gone');
  // Kept and narrowed, never deleted: the ban still has to exist.
  for (const kept of ['getBoundingClientRect', 'DOMMatrix', 'onPointerDown', 'isS07Delivered']) {
    if (!s02.includes(kept)) {
      fail(`tools/check-app3-s02*.mjs: no longer rules on ${kept}`);
    }
  }
  // And it must still rule on the element itself, in either world.
  if (!s02.includes('stageElement')) {
    fail(`tools/check-app3-s02*.mjs: no longer rules on the drawn element`);
  }
}
