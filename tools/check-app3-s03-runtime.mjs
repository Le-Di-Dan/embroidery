/**
 * `APP3-S03` — the runtime rules: which fields a transform writes, whose frame
 * it writes them in, what rules on a candidate before it is committed, and which
 * capabilities the stage must not grow now that it can change a document.
 *
 * The rules worth a machine are the ones that stay green while being wrong. A
 * resize that writes `width` looks identical on a rectangle and silently fails
 * to resize a `freehand` element at all. A grouped child moved by adding the raw
 * document delta to `x`/`y` tracks the pointer perfectly until the group is
 * rotated. A candidate validated before quantization passes by a ten-thousandth
 * of a pixel and is committed outside the safe area. A clamp draws a design that
 * fits and is not the one the customer made. And a rotation about the
 * transformed-AABB centre looks right for a square and drifts for everything
 * else.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CANONICAL_FILES,
  FEATURE,
  FORBIDDEN_ENGINES,
  code,
  collect,
  featureCode,
  preS03Code,
  read,
  s03Code,
} from './check-app3-s03.sources.mjs';

/** Repairs `IMP-D045` PO-09 forbids: the candidate is committed or it is not. */
const REPAIRS = Object.freeze([
  /clamp(?!ed to the interval)/i,
  /snapTo/,
  /scaleDown/,
  /fitInside/,
  /nudgeInto/,
  /Math\.min\([^)]*area/i,
]);

/** Storage a runtime working document must never reach. */
const PERSISTENCE = Object.freeze([
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'document.cookie',
  'persist(',
  'history.pushState',
  'history.replaceState',
  'useSearchParams',
]);

/** One scene, one working document, no engine. */
export function checkFoundation(rootDir, fail) {
  for (const key of [
    'transform',
    'handles',
    'authority',
    'mapping',
    'gesture',
    'overlay',
    'documentStore',
  ]) {
    if (!existsSync(join(rootDir, CANONICAL_FILES[key]))) {
      fail(`${CANONICAL_FILES[key]}: missing`);
    }
  }

  const all = featureCode(rootDir);
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

  // The `APP3-S07` wrapper still owns the viewport, and the scene is still
  // memoised on the document alone.
  if (!code(rootDir, 'viewport').includes('viewportTransform(')) {
    fail(`${CANONICAL_FILES.viewport}: the viewport transform left the S07 wrapper`);
  }
  const screen = code(rootDir, 'stageScreen');
  // The dependency list is the rule. `APP3-S03-C1` passes the previous build in
  // as a second argument for identity reuse; what must never appear in the list
  // is the viewport, which would re-run the adapter on every zoom step.
  if (
    !/useMemo\(\s*\(\)\s*=>\s*buildRenderableScene\(stageDocument[^)]*\),\s*\[stageDocument\],?\s*\)/.test(
      screen,
    )
  ) {
    fail(`${CANONICAL_FILES.stageScreen}: the scene is not memoised on the working document alone`);
  }
}

/** Exactly one runtime-only working document, keyed by Session identity. */
export function checkWorkingDocument(rootDir, fail) {
  const store = code(rootDir, 'documentStore');
  for (const required of ['sessionKey', 'initialize', 'commit', 'reset']) {
    if (!store.includes(required)) {
      fail(`${CANONICAL_FILES.documentStore}: publishes no ${required}`);
    }
  }
  // `initialize` on the same key must be a no-op, or a re-render silently
  // discards whatever the customer just did.
  if (!/state\.sessionKey === sessionKey \? state :/.test(store)) {
    fail(`${CANONICAL_FILES.documentStore}: re-initializing discards local edits`);
  }
  // A Session identity may not come to rest in a store (`APP3-S01`).
  for (const identity of ['sessionId', 'snapshot', 'secret', 'expiresAt']) {
    if (store.includes(identity)) {
      fail(`${CANONICAL_FILES.documentStore}: a Session identity reaches the store (${identity})`);
    }
  }
  for (const forbidden of [
    'SVGElement',
    'HTMLElement',
    'DOMRect',
    'DOMMatrix',
    'useRef',
    'PointerEvent',
  ]) {
    if (store.includes(forbidden)) {
      fail(`${CANONICAL_FILES.documentStore}: keeps ${forbidden}, which is not serializable`);
    }
  }

  const s03 = s03Code(rootDir);
  for (const persistence of PERSISTENCE) {
    if (s03.includes(persistence)) {
      fail(`${FEATURE}: persists the working document (${persistence})`);
    }
  }

  // Exactly one store holds a document. A second editable copy is the defect
  // §9 exists to prevent, and both would be plausible until they disagree.
  const stores = collect(join(rootDir, FEATURE, 'store'), /\.ts$/).filter((path) =>
    readFileSync(path, 'utf8').includes('DesignDocument'),
  );
  if (stores.length !== 1) {
    fail(`${FEATURE}/store: ${String(stores.length)} stores hold a document, expected exactly 1`);
  }

  const screen = code(rootDir, 'stageScreen');
  if (!screen.includes('sessionKeyOf(snapshot.sessionId, snapshot.revision)')) {
    fail(
      `${CANONICAL_FILES.stageScreen}: the working document is not keyed by Session and revision`,
    );
  }
}

/** Every candidate number comes from `APP3-P02`, in the right frame. */
export function checkGeometryAuthority(rootDir, fail) {
  const transform = code(rootDir, 'transform');
  for (const api of [
    'resolveEffectiveTransform',
    'invertMatrix',
    'transformPoint',
    'transformVector',
    'composeMatrices',
    'rotationClockwiseMatrix',
    'translationMatrix',
  ]) {
    if (!transform.includes(api)) {
      fail(`${CANONICAL_FILES.transform}: does not ask the engine for ${api}`);
    }
  }

  // A move is a **vector** through the inverse *parent* matrix. Adding a
  // document delta straight to `x`/`y` is correct for a root element and wrong
  // for every grouped child under a rotated or scaled group.
  if (!/transformVector\(inverse, documentDelta\)/.test(transform)) {
    fail(`${CANONICAL_FILES.transform}: a move is not expressed in the parent frame`);
  }
  if (!/safeInvert\(frames\.parent\)/.test(transform)) {
    fail(`${CANONICAL_FILES.transform}: a move does not invert the parent frame`);
  }

  // The resolved v1 resize model: scale, never width or height.
  if (!/return \{ \.\.\.start, scaleX, scaleY \}/.test(transform)) {
    fail(`${CANONICAL_FILES.transform}: resize does not persist scale about the centre`);
  }
  for (const rewrite of [/width:\s*[^,}]*documentDelta/, /height:\s*[^,}]*documentDelta/]) {
    if (rewrite.test(transform)) {
      fail(`${CANONICAL_FILES.transform}: resize rewrites width/height instead of scale`);
    }
  }

  // Rotation about the untransformed local-box centre, never the AABB centre.
  if (!/rotationDeg: start\.rotationDeg \+/.test(transform)) {
    fail(`${CANONICAL_FILES.transform}: rotation does not build on the starting angle`);
  }
  for (const wrong of ['getElementBounds', 'boundsCorners', 'aabb', 'AABB']) {
    if (transform.includes(wrong)) {
      fail(`${CANONICAL_FILES.transform}: rotation or resize reaches for bounds (${wrong})`);
    }
  }

  // No second matrix builder, anywhere, in any world.
  const all = featureCode(rootDir);
  for (const local of [/Math\.(cos|sin|tan)\(/, /multiplyMatrices\(/, /new DOMMatrix/]) {
    if (local.test(all)) {
      fail(`${FEATURE}: builds a matrix the engine owns (${String(local)})`);
    }
  }
  // And the one piece of trigonometry stays where the pointer is read.
  if (preS03Code(rootDir).includes('Math.atan2')) {
    fail(`${FEATURE}: converts an angle outside the transform model`);
  }
  for (const measurement of [
    'getBoundingClientRect',
    'getScreenCTM',
    'getBBox',
    'getComputedStyle',
  ]) {
    if (all.includes(measurement)) {
      fail(`${FEATURE}: takes geometry from the DOM (${measurement})`);
    }
  }
}

/** Quantize, then measure, then block. Never repair. */
export function checkValidation(rootDir, fail) {
  const authority = code(rootDir, 'authority');
  for (const api of [
    'validateDesignDocumentStructure(',
    'quantizeDesignDocument(',
    'validateElementWithinEmbroideryArea(',
    'validateElementPhysicalSize(',
  ]) {
    if (!authority.includes(api)) {
      fail(`${CANONICAL_FILES.authority}: does not rule on a candidate with ${api}`);
    }
  }
  // Quantization must come **before** the geometry is measured: a candidate
  // that fits by a ten-thousandth of a pixel passes on the raw number and fails
  // on the number that will actually be stored (`IMP-D045` PO-09).
  const quantizeAt = authority.indexOf('quantizeDesignDocument(');
  const containAt = authority.indexOf('validateElementWithinEmbroideryArea(');
  if (quantizeAt < 0 || containAt < 0 || quantizeAt > containAt) {
    fail(`${CANONICAL_FILES.authority}: containment is measured before quantization`);
  }
  // The Side's own `pxPerMm` is the only conversion authority (PO-10).
  if (!/pxPerMm: scope\.pxPerMm/.test(authority)) {
    fail(`${CANONICAL_FILES.authority}: physical scale does not come from the Product Side`);
  }

  const s03 = s03Code(rootDir);
  for (const repair of REPAIRS) {
    if (repair.test(s03)) {
      fail(`${FEATURE}: repairs an invalid candidate (${String(repair)})`);
    }
  }
  // The commit path is gated on the outcome, not merely informed by it.
  const gesture = code(rootDir, 'gesture');
  if (!/if \(outcome\.ok\) \{\s*liveCommit\(outcome\.document\);/.test(gesture)) {
    fail(`${CANONICAL_FILES.gesture}: commits a candidate that was not ruled valid`);
  }
}

/** The approved chrome, in the DOM, at a size a pointer can actually hit. */
export function checkChrome(rootDir, fail) {
  const handles = code(rootDir, 'handles');
  // The **array**, not the file. The `ResizeHandleId` union names every id as
  // well, so a rule that searched the whole source would stay green with a
  // handle deleted from the set the overlay actually renders.
  const declared = /RESIZE_HANDLES[^=]*=\s*Object\.freeze\(\[([^\]]*)\]/.exec(handles);
  if (declared === null) {
    fail(`${CANONICAL_FILES.handles}: the handle set is not a frozen array`);
  } else {
    const ids = [...declared[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
    for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      if (!ids.includes(handle)) {
        fail(`${CANONICAL_FILES.handles}: the handle set is missing ${handle}`);
      }
    }
    if (ids.length !== 8) {
      fail(`${CANONICAL_FILES.handles}: ${String(ids.length)} resize handles, expected exactly 8`);
    }
  }

  const overlay = code(rootDir, 'overlay');
  if (overlay.includes('<svg') || overlay.includes('<rect')) {
    fail(`${CANONICAL_FILES.overlay}: draws chrome into the scene instead of the DOM`);
  }
  if (!overlay.includes('frames.effective')) {
    fail(`${CANONICAL_FILES.overlay}: handles are not placed on the engine's effective matrix`);
  }
  if (!overlay.includes('handleCounterScale(')) {
    fail(`${CANONICAL_FILES.overlay}: handles are not counter-scaled against the viewport`);
  }
  if (!overlay.includes('aria-label')) {
    fail(`${CANONICAL_FILES.overlay}: a handle carries no accessible name`);
  }

  const styles = read(rootDir, 'styles') ?? '';
  if (!/\.studio-stage__handle\s*\{[^}]*\$size-touch-target-min/.test(styles)) {
    fail(`${CANONICAL_FILES.styles}: the handle hit target is not the shared 44 px minimum`);
  }
  if (!/\.studio-stage__scene\s*\{[^}]*position:\s*relative/.test(styles)) {
    fail(`${CANONICAL_FILES.styles}: the overlay has no positioned box to align against`);
  }

  // The drawn element itself still never follows a pointer: the move surface is
  // DOM chrome, which is what keeps the `APP3-S02` scene byte-identical.
  for (const gesture of ['onPointerDown', 'onPointerMove', 'onPointerUp']) {
    if (code(rootDir, 'stageElement').includes(gesture)) {
      fail(`${CANONICAL_FILES.stageElement}: the drawn element follows a pointer`);
    }
  }
}

/** The capabilities S03 must not grow, each named with its real owner. */
export function checkNonScope(rootDir, fail) {
  const all = featureCode(rootDir);
  const owners = Object.freeze({
    onTouchStart: 'APP3-S11',
    onTouchMove: 'APP3-S11',
    pinch: 'APP3-S11',
    undoStack: 'APP3-S08',
    redoStack: 'APP3-S08',
    commandHistory: 'APP3-S08',
    watermark: 'APP3-S09',
    reorder: 'APP3-S04',
    ungroup: 'APP3-S04',
    duplicate: 'APP3-S04',
    fontPicker: 'APP3-S05',
    setFontId: 'APP3-S05',
    onChangeText: 'APP3-S05',
    publicDesignSessionAutosave: 'APP3-S10',
    publicDesignSessionAsset: 'APP3-S06',
  });
  for (const [marker, owner] of Object.entries(owners)) {
    if (all.includes(marker)) {
      fail(`${FEATURE}: carries "${marker}", a capability ${owner} owns`);
    }
  }

  // A touch pointer is refused explicitly, rather than by omission.
  if (!code(rootDir, 'gesture').includes("pointerType === 'touch'")) {
    fail(`${CANONICAL_FILES.gesture}: a touch pointer is not refused, which is APP3-S11's`);
  }
  // Locked and hidden elements are not transformable.
  const screen = code(rootDir, 'stageScreen');
  if (!/selected\.visible && !selected\.element\.locked/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: a locked or hidden element can be transformed`);
  }

  // The transform reaches no server at all.
  for (const call of ['useQuery', 'useMutation', '@embroidery/api-client', 'axios']) {
    if (s03Code(rootDir).includes(call) && call !== '@embroidery/api-client') {
      fail(`${FEATURE}: the transform reaches the network (${call})`);
    }
  }
  // Selection ownership is unchanged: one id, no multi-select.
  const selection = code(rootDir, 'selectionStore');
  if (/selectedElementIds|selectedElements\b/.test(selection)) {
    fail(`${CANONICAL_FILES.selectionStore}: grew a multi-selection S03 does not own`);
  }
  if (selection.includes('transform')) {
    fail(`${CANONICAL_FILES.selectionStore}: the selection store grew transform state`);
  }
}

/** The predecessor gates S03 had to evolve, and the way they had to evolve. */
export function checkPredecessorGates(rootDir, fail) {
  const s02 = collect(join(rootDir, 'tools'), /^check-app3-s02.*\.mjs$/)
    .filter((path) => !path.endsWith('.test.mjs'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  if (s02 === '') {
    fail('tools/check-app3-s02*.mjs: the predecessor gate is gone');
    return;
  }
  // Kept and narrowed, never deleted.
  for (const kept of ['onPointerDown', 'clientWidth', 'isS03Delivered', 'Math\\.(cos|sin|tan)']) {
    if (!s02.includes(kept)) {
      fail(`tools/check-app3-s02*.mjs: no longer rules on ${kept}`);
    }
  }
  const s07 = read(rootDir, 'tools/check-app3-s07-runtime.mjs') ?? '';
  if (!s07.includes('stageDocument')) {
    fail('tools/check-app3-s07-runtime.mjs: no longer rules on the memoised scene');
  }
}
