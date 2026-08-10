/**
 * `APP3-S02` — the runtime rules: what the renderer is, where its geometry
 * comes from, what the selection may hold, which bytes the stage may fetch, and
 * which capabilities it must not grow.
 *
 * Split from `check-app3-s02.mjs` by responsibility: that module rules on the
 * predecessors, the design approval and the artifacts that must not move, this
 * one on what the stage actually does. Both import their paths from
 * `check-app3-s02.sources.mjs`, so neither carries a copy.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import { isS07Delivered } from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  CONSUMED_OPERATION,
  FEATURE,
  FORBIDDEN_ENGINES,
  REQUIRED_WORKSPACE_PACKAGES,
  code,
  collect,
  featureCode,
  read,
  s02FeatureCode,
  storefrontCode,
} from './check-app3-s02.sources.mjs';
import {
  DOM_MEASUREMENT,
  LOCAL_GEOMETRY,
  POINTER_GESTURE,
  VIEWPORT_MEASUREMENT,
} from './check-app3-s02-bans.mjs';

/** One native-SVG renderer, no engine, and the adapter boundary that feeds it. */
export function checkRenderer(rootDir, fail) {
  const all = featureCode(rootDir);

  for (const key of ['scene', 'svgMatrix', 'stage', 'stageElement']) {
    if (!existsSync(join(rootDir, CANONICAL_FILES[key]))) {
      fail(`${CANONICAL_FILES[key]}: missing`);
    }
  }

  // Exactly one. Two `<svg>` roots in one feature are two renderers, whatever
  // the second one is called.
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

  // The adapter is a boundary only if the components consume it rather than
  // re-deriving. A stage that built its own graph would be the giant component
  // §10 exists to prevent.
  const scene = code(rootDir, 'scene');
  if (!scene.includes('buildRenderableScene')) {
    fail(`${CANONICAL_FILES.scene}: publishes no scene builder`);
  }
  const stage = code(rootDir, 'stage');
  if (stage.includes('buildElementGraph') || stage.includes('resolveEffectiveTransform')) {
    fail(`${CANONICAL_FILES.stage}: resolves geometry itself instead of consuming the adapter`);
  }
  if (!stage.includes('scene.elements')) {
    fail(`${CANONICAL_FILES.stage}: does not draw from the adapter's scene`);
  }

  // The isolated APP0 spike and the Admin editor are both off-limits as source.
  for (const forbidden of [
    'spikes/',
    '@embroidery-spike/',
    'apps/admin',
    'features/design-template-editor',
  ]) {
    if (storefrontCode(rootDir).includes(forbidden)) {
      fail(`${FEATURE}: imports from "${forbidden}", which is not a Storefront dependency`);
    }
  }
}

/** Every number on screen comes from `APP3-P01` or `APP3-P02`. */
export function checkGeometryAuthority(rootDir, fail) {
  const scene = code(rootDir, 'scene');
  for (const api of [
    'buildElementGraph',
    'resolveEffectiveTransform',
    'getElementBounds',
    'structuralFinding',
    'isGeometryFinding',
  ]) {
    if (!scene.includes(api)) {
      fail(`${CANONICAL_FILES.scene}: does not ask the engine for ${api}`);
    }
  }
  // The document boundary: P01 validates, and nothing repairs. Anchored on the
  // **call**, not the mention: an import left behind after the call was
  // replaced satisfies a bare `includes` while the adapter trusts the payload.
  if (!scene.includes('validateDesignDocumentStructure(')) {
    fail(`${CANONICAL_FILES.scene}: does not validate the document through APP3-P01`);
  }
  if (!scene.includes('findControlledFont(')) {
    fail(`${CANONICAL_FILES.scene}: resolves a font outside the controlled registry`);
  }

  const all = featureCode(rootDir);
  for (const local of LOCAL_GEOMETRY) {
    if (local.test(all)) {
      fail(`${FEATURE}: implements geometry the engine owns (${String(local)})`);
    }
  }
  for (const measurement of DOM_MEASUREMENT) {
    if (all.includes(measurement)) {
      fail(`${FEATURE}: takes geometry from the DOM (${measurement})`);
    }
  }
  // Narrowed only once S07 exists; before that the original whole-feature
  // absence is still what is asserted.
  const measurementScope = isS07Delivered(rootDir) ? s02FeatureCode(rootDir) : all;
  for (const measurement of VIEWPORT_MEASUREMENT) {
    if (measurementScope.includes(measurement)) {
      fail(`${FEATURE}: takes geometry from the DOM (${measurement})`);
    }
  }

  // The viewBox is the document's own placement canvas. A CSS scale multiplied
  // into it would put every element in the wrong place at some viewport width.
  if (
    !/viewBox=\{`0 0 \$\{String\(scene\.canvasWidthPx\)\} \$\{String\(scene\.canvasHeightPx\)\}`\}/.test(
      code(rootDir, 'stage'),
    )
  ) {
    fail(`${CANONICAL_FILES.stage}: the viewBox is not the document placement canvas`);
  }

  // Paint order is document order. A sort or reverse anywhere on the render
  // path is a second z-order competing with `APP3-P01`'s array.
  for (const key of ['stage', 'scene']) {
    if (/\.(reverse|sort)\(/.test(code(rootDir, key))) {
      fail(`${CANONICAL_FILES[key]}: re-orders the element list, which is z-order`);
    }
  }
}

/** Runtime-only selection, and a store that can hold nothing dangerous. */
export function checkSelection(rootDir, fail) {
  const store = code(rootDir, 'store');
  if (!store.includes('selectedElementId')) {
    fail(`${CANONICAL_FILES.store}: holds no selected element`);
  }
  // Single-select: an array would be `APP3-S03`/`S04` state arriving early.
  if (/selectedElementIds|selectedElements\b/.test(store)) {
    fail(`${CANONICAL_FILES.store}: holds a multi-selection S02 does not own`);
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
    'useRef',
    'persist(',
    'localStorage',
    'sessionStorage',
  ]) {
    if (store.includes(forbidden)) {
      fail(
        `${CANONICAL_FILES.store}: keeps ${forbidden}, which is not serializable interaction state`,
      );
    }
  }
  // Nothing later in the phase may be pre-built here.
  for (const early of ['history', 'undo', 'redo', 'zoom', 'pan', 'layers', 'upload', 'watermark']) {
    if (store.includes(early)) {
      fail(`${CANONICAL_FILES.store}: pre-builds ${early} state a later checkpoint owns`);
    }
  }

  // A selection written into a request body or browser storage would make a
  // runtime cursor position part of what the customer saved. Services are where
  // that would happen, so that is where it is ruled out — a prop or a type
  // naming the id is how it reaches the stage, not how it escapes.
  for (const path of collect(join(rootDir, FEATURE, 'services'), /\.ts$/)) {
    const service = code(rootDir, relative(rootDir, path).replaceAll('\\', '/'));
    if (service.includes('selectedElementId') || service.includes('selection')) {
      fail(`${relative(rootDir, path)}: sends the runtime selection to the server`);
    }
  }
  const all = featureCode(rootDir);
  for (const persisted of [
    /localStorage\.setItem\([^)]*select/i,
    /JSON\.stringify\([^)]*selectedElementId/,
  ]) {
    if (persisted.test(all)) {
      fail(`${FEATURE}: persists the runtime selection (${String(persisted)})`);
    }
  }
  if (!code(rootDir, 'stageScreen').includes('reconcileSelection')) {
    fail(`${CANONICAL_FILES.stageScreen}: a stale selection is never dropped`);
  }
}

/** The one media path the stage may take, and its browser resource. */
export function checkMedia(rootDir, fail) {
  const service = code(rootDir, 'backgroundService');
  if (!service.includes(`${CONSUMED_OPERATION}(`)) {
    fail(`${CANONICAL_FILES.backgroundService}: does not call ${CONSUMED_OPERATION}`);
  }
  // The address is contextual. An asset id, derivative id or storage key here
  // would be a generic media grant wearing a contextual route's clothes.
  for (const generic of [
    'assetId',
    'derivativeId',
    'storageKey',
    'presign',
    'amazonaws',
    'minio',
    's3://',
  ]) {
    if (service.includes(generic)) {
      fail(`${CANONICAL_FILES.backgroundService}: names ${generic}`);
    }
  }

  const hook = code(rootDir, 'backgroundHook');
  if (!hook.includes('URL.createObjectURL') || !hook.includes('URL.revokeObjectURL')) {
    fail(`${CANONICAL_FILES.backgroundHook}: the object URL is not created and revoked here`);
  }
  if (!/return \(\) => \{\s*URL\.revokeObjectURL/.test(hook)) {
    fail(`${CANONICAL_FILES.backgroundHook}: revocation is not effect cleanup`);
  }
  if (!hook.includes('gcTime: 0')) {
    fail(
      `${CANONICAL_FILES.backgroundHook}: the no-store blob is retained after nothing renders it`,
    );
  }
  if (hook.includes('placeholderData')) {
    fail(
      `${CANONICAL_FILES.backgroundHook}: keeps the previous Side's background while a new key loads`,
    );
  }

  const curated = read(rootDir, 'curatedClient') ?? '';
  if (!curated.includes(CONSUMED_OPERATION)) {
    fail(`${CANONICAL_FILES.curatedClient}: ${CONSUMED_OPERATION} is not exported to consumers`);
  }
  // Still withheld: an operation on that boundary is an invitation to call it,
  // and neither screen exists.
  for (const withheld of ['publicDesignSessionAutosave', 'publicDesignSessionAssetCreate']) {
    if (curated.split('\n').some((line) => line.trim().startsWith(withheld))) {
      fail(`${CANONICAL_FILES.curatedClient}: ${withheld} crossed the boundary without a consumer`);
    }
  }

  const all = featureCode(rootDir);
  // `APP3-B06C` does not exist, and `APP3-B05A` is Template authority a cloned
  // Session does not inherit — so an open stage must reach neither.
  for (const forbidden of [
    'publicDesignSessionAsset',
    'publicProductMediaGet',
    'adminProductSideBackgroundGet',
  ]) {
    if (all.includes(forbidden)) fail(`${FEATURE}: reaches ${forbidden}, which S02 does not own`);
  }
  if (code(rootDir, 'stageElement').includes('publicDesignTemplateAssetGet')) {
    fail(`${CANONICAL_FILES.stageElement}: uses B05A as a Session media shortcut`);
  }
  if (all.includes('publicDesignSessionAutosave')) {
    fail(`${FEATURE}: autosaves, which is APP3-S10's`);
  }
}

/** The capabilities S02 must not grow, each named with its real owner. */
export function checkNonScope(rootDir, fail) {
  const all = featureCode(rootDir);
  const owners = Object.freeze({
    onDragStart: 'APP3-S03',
    onDragEnd: 'APP3-S03',
    onMouseMove: 'APP3-S03',
    draggable: 'APP3-S03',
    resizeHandle: 'APP3-S03',
    onWheel: 'APP3-S07',
    onTouchMove: 'APP3-S11',
    watermark: 'APP3-S09',
    Watermark: 'APP3-S09',
    undoStack: 'APP3-S08',
    redoStack: 'APP3-S08',
  });
  for (const [marker, owner] of Object.entries(owners)) {
    if (all.includes(marker)) {
      fail(`${FEATURE}: carries "${marker}", a capability ${owner} owns`);
    }
  }

  // The pan gesture, scoped to the files that may hold it. An element that
  // could follow a pointer is `APP3-S03` arriving early, whichever checkpoint
  // is shipping.
  const gestureScope = isS07Delivered(rootDir) ? s02FeatureCode(rootDir) : all;
  for (const marker of POINTER_GESTURE) {
    if (gestureScope.includes(marker)) {
      fail(`${FEATURE}: carries "${marker}" outside the APP3-S07 viewport`);
    }
  }
  // Whatever else moves, the drawn element itself never follows a pointer.
  for (const marker of POINTER_GESTURE) {
    if (code(rootDir, 'stageElement').includes(marker)) {
      fail(`${CANONICAL_FILES.stageElement}: an element follows the pointer, which is APP3-S03's`);
    }
  }

  // No transform mutation of any kind: the document arrives from the server and
  // leaves this checkpoint byte-identical. Anchored on the *document*, because
  // the adapter legitimately builds a fresh scene array of its own — a ban that
  // fired on that would be forbidding the thing the adapter is for.
  for (const mutation of [
    /\.transform\.x\s*=[^=]/,
    /\.transform\.y\s*=[^=]/,
    /\.rotationDeg\s*=[^=]/,
    /\.scaleX\s*=[^=]/,
    /document\.elements\s*=/,
    /document\.elements\.(push|splice|sort|reverse)\(/,
    /snapshot\.document\s*=/,
  ]) {
    if (mutation.test(all)) {
      fail(`${FEATURE}: mutates the Design Document (${String(mutation)})`);
    }
  }
}

/** The Storefront's production dependencies, which decide what can be bundled. */
export function checkDependencies(rootDir, fail) {
  const manifest = JSON.parse(read(rootDir, 'storefrontPackage') ?? '{}');
  const dependencies = Object.keys(manifest.dependencies ?? {});
  for (const required of REQUIRED_WORKSPACE_PACKAGES) {
    if (!dependencies.includes(required)) {
      fail(`${CANONICAL_FILES.storefrontPackage}: ${required} is not a dependency`);
    }
  }
  for (const engine of FORBIDDEN_ENGINES) {
    if (dependencies.includes(engine)) {
      fail(`${CANONICAL_FILES.storefrontPackage}: depends on the rendering engine "${engine}"`);
    }
  }
  // A new shared package is not S02's to create.
  for (const invented of [
    '@embroidery/design-renderer',
    '@embroidery/studio',
    '@embroidery/canvas',
  ]) {
    if (dependencies.includes(invented)) {
      fail(`${CANONICAL_FILES.storefrontPackage}: depends on a package S02 invented (${invented})`);
    }
  }
}
