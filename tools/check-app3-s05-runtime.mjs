/**
 * `APP3-S05` — the runtime rules: which font a document may name, which fields a
 * text edit writes, what rules on a candidate before it is committed, and which
 * capabilities the inspector must not grow now that the stage can edit text.
 *
 * The rules worth a machine are the ones that stay green while being wrong. A
 * font picker built from a literal list behaves identically to the
 * registry-derived one until the registry changes. A `normalize('NFC')` on the
 * write path makes every non-NFC refusal disappear while silently altering the
 * customer's own text. A glyph measurement used as geometry is a second answer
 * to where an element sits, and it agrees with the first one most of the time.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  CANONICAL_FILES,
  CONTROLLED_FONT_ASSETS,
  FEATURE,
  STOREFRONT,
  code,
  collect,
  featureCode,
  preS09Code,
  read,
  s05Code,
} from './check-app3-s05.sources.mjs';
import { isS09Delivered } from './app3-accepted-surface.mjs';

/** The font picker is the controlled registry, and can be nothing else. */
export function checkControlledFont(rootDir, fail) {
  const fields = code(rootDir, 'fields');
  if (fields === '') {
    fail(`${CANONICAL_FILES.fields}: the text field authority is missing`);
    return;
  }
  // Derived, not merely imported: an unused import beside a literal list would
  // satisfy a rule that only asked whether the registry was named.
  if (!fields.includes('DESIGN_FONT_REGISTRY.map(')) {
    fail(`${CANONICAL_FILES.fields}: the font options are not derived from the registry`);
  }

  // A family name written into the feature is a second font list, whatever it
  // is called. `Inter` may appear only in the stylesheet's `@font-face`.
  const feature = featureCode(rootDir);
  for (const literal of [
    "'Inter'",
    '"Inter"',
    'General Sans',
    'Helvetica',
    'Arial',
    'Roboto',
    'fonts.googleapis',
    'fonts.gstatic',
  ]) {
    if (feature.includes(literal)) {
      fail(`${FEATURE}: a font literal or remote font source reached the feature (${literal})`);
    }
  }
  // Nothing may put a font path, URL or binary into a document.
  for (const smuggled of ['fontFamily:', 'fontUrl', 'woff2', '.ttf', '.otf']) {
    if (s05Code(rootDir).includes(smuggled)) {
      fail(`${FEATURE}: a font asset reference reached the text capability (${smuggled})`);
    }
  }

  const styles = read(rootDir, 'styles') ?? '';
  for (const asset of CONTROLLED_FONT_ASSETS) {
    if (!existsSync(join(rootDir, asset))) {
      fail(`${asset}: the controlled font binary APP3-F01 recorded is missing`);
    }
    if (!styles.includes(asset.split('/').at(-1) ?? '')) {
      fail(`${CANONICAL_FILES.styles}: does not serve ${asset.split('/').at(-1) ?? ''}`);
    }
  }
  // Served from the package that owns the registry, never a copy under public/.
  if (!styles.includes('packages/design-document/assets/fonts/inter/4.1/')) {
    fail(`${CANONICAL_FILES.styles}: the controlled face is not served from the APP3-F01 asset`);
  }
  if (existsSync(join(rootDir, STOREFRONT, 'public/fonts'))) {
    fail(`${STOREFRONT}/public/fonts: a second copy of the controlled font exists`);
  }
  // The three honest states, and a policy that never substitutes silently.
  const font = code(rootDir, 'controlledFont');
  for (const state of ['loading', 'ready', 'unavailable']) {
    if (!font.includes(`'${state}'`)) {
      fail(`${CANONICAL_FILES.controlledFont}: does not report the ${state} state`);
    }
  }
  // The browser is asked, somewhere in the capability. *Which* question is asked
  // is `checkVariantReadiness`'s subject: `APP3-S05-C1` moved the call into the
  // variant module, so pinning it to the hook would now fail a correct tree.
  if (!s05Code(rootDir).includes('document.fonts')) {
    fail(`${FEATURE}: never asks the browser whether the face loaded`);
  }
}

/** Only P01 fields are editable, and every bound is read rather than restated. */
export function checkSchemaFidelity(rootDir, fail) {
  const fields = code(rootDir, 'fields');

  for (const required of [
    'export const EDITABLE_TEXT_FIELDS',
    'export function withTextFields',
    'export function textElementOf',
    'export function characterCount',
  ]) {
    if (!fields.includes(required)) {
      fail(`${CANONICAL_FILES.fields}: publishes no "${required}"`);
    }
  }
  // A field v1 cannot persist would produce a document APP3-P01 refuses.
  const s05 = s05Code(rootDir);
  for (const invented of [
    'letterSpacing',
    'lineHeight',
    'textDecoration',
    'textOnPath',
    'curvedText',
    'threadColor',
    'threadCode',
    'pantone',
    'stitchDensity',
    'stitchCount',
  ]) {
    if (s05.includes(invented)) {
      fail(
        `${FEATURE}: a field the v1 schema cannot persist reached the text capability (${invented})`,
      );
    }
  }
  // Limits and ranges are P01's answers, never a literal that agrees today.
  if (
    !fields.includes('DESIGN_DOCUMENT_LIMITS') ||
    !fields.includes('DESIGN_DOCUMENT_VALUE_RANGES')
  ) {
    fail(`${CANONICAL_FILES.fields}: does not read the P01 limits and ranges`);
  }
  /*
   * A character limit written as a literal is correct today and is not P01's
   * answer. `500` is also a legal font *weight*, and the weight steps are a
   * conventional UI ladder rather than a restatement of a limit — so the ladder
   * is removed before scanning, and the numbers are then banned outright.
   */
  const withoutWeights = s05.replace(/WEIGHT_STEPS[\s\S]*?\]\);/, '');
  for (const literal of ['500', '5000', '5_000']) {
    if (new RegExp(`[^\\w.]${literal}[^\\w]`).test(withoutWeights)) {
      fail(`${FEATURE}: a P01 text limit is restated as the literal ${literal}`);
    }
  }
  // Code points, not UTF-16 units: `text.length` would charge an astral
  // character twice against the customer's 500.
  if (!fields.includes('[...text]')) {
    fail(`${CANONICAL_FILES.fields}: characters are not counted as code points`);
  }
}

/** Validation is P01's, is never bypassed, and never rewrites the customer's text. */
export function checkValidation(rootDir, fail) {
  const authority = code(rootDir, 'authority');
  if (authority === '') {
    fail(`${CANONICAL_FILES.authority}: the text candidate authority is missing`);
    return;
  }
  for (const required of [
    'validateDesignDocumentStructure',
    'validateDesignDocumentComplexity',
    'findControlledFont',
    'supportsVariant',
    'ruleOnCandidate',
  ]) {
    if (!authority.includes(required)) {
      fail(`${CANONICAL_FILES.authority}: a text candidate is committed without ${required}`);
    }
  }
  // Structure before complexity: a non-finite number is not a character count.
  const structureAt = authority.indexOf('validateDesignDocumentStructure(candidate)');
  const complexityAt = authority.indexOf('validateDesignDocumentComplexity(');
  if (structureAt === -1 || complexityAt === -1 || structureAt > complexityAt) {
    fail(`${CANONICAL_FILES.authority}: complexity is measured before the document is validated`);
  }

  // The rule this whole file exists for. A normalize on the write path makes
  // every non-NFC refusal disappear and changes the customer's text silently.
  const s05 = s05Code(rootDir);
  for (const rewrite of ["normalize('NFC')", 'normalize("NFC")', '.normalize()']) {
    if (s05.includes(rewrite)) {
      fail(
        `${FEATURE}: text is normalized on the write path instead of being refused (${rewrite})`,
      );
    }
  }
  // No truncation, no repair, no clamp.
  for (const repair of ['.slice(0, 500', 'substring(0, 500', 'Math.min(500', 'truncate']) {
    if (s05.includes(repair)) {
      fail(`${FEATURE}: a text candidate is repaired instead of refused (${repair})`);
    }
  }
}

/** Geometry stays APP3-P02's; nothing here measures a glyph. */
export function checkGeometryBoundary(rootDir, fail) {
  const feature = featureCode(rootDir);
  for (const local of [
    'measureText',
    'getBBox',
    'getComputedTextLength',
    'createRange',
    'document.createRange',
    'TextMetrics',
    'FontFaceObserver',
  ]) {
    if (feature.includes(local)) {
      fail(`${FEATURE}: a local text-layout or measurement engine reached the feature (${local})`);
    }
  }
  // A text edit must not write geometry. `withTextFields` may touch only the
  // editable text fields, so a transform key appearing in it is the failure.
  const fields = code(rootDir, 'fields');
  const patch = fields.slice(fields.indexOf('export function withTextFields'));
  for (const key of ['transform:', 'rotationDeg', 'scaleX', 'width:', 'height:']) {
    if (patch.includes(key)) {
      fail(`${CANONICAL_FILES.fields}: a text edit writes geometry (${key})`);
    }
  }
}

/** One working document, one SVG scene, and the S03-C1 reuse path intact. */
export function checkArchitecture(rootDir, fail) {
  const feature = featureCode(rootDir);

  if (feature.split('<svg').length - 1 !== 1) {
    fail(`${FEATURE}: the feature no longer opens exactly one <svg>`);
  }
  // One store holding a document, and it is still S03's.
  const holders = collect(join(rootDir, FEATURE), /\.tsx?$/).filter((path) =>
    code(rootDir, relative(rootDir, path).replaceAll('\\', '/')).includes('create<'),
  );
  const documentStores = holders.filter((path) =>
    readFileSync(path, 'utf8').includes('DesignDocument | null'),
  );
  if (documentStores.length !== 1) {
    fail(`${FEATURE}: ${String(documentStores.length)} stores hold a Design Document, expected 1`);
  }
  // No browser persistence, no second draft that could outlive the tab.
  for (const persisted of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
    if (feature.includes(persisted)) {
      fail(`${FEATURE}: the text capability persists a draft (${persisted})`);
    }
  }
  // `APP3-S03-C1` is accepted architecture now, not an optimization to revisit.
  const stageElement = code(rootDir, 'stageElement');
  if (!/export const StudioStageElement = memo\(/.test(stageElement)) {
    fail(`${CANONICAL_FILES.stageElement}: the element component is no longer memoized`);
  }
  const screen = code(rootDir, 'stageScreen');
  if (!/buildRenderableScene\(stageDocument,\s*sceneMemo\.current\)/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the previous scene build is no longer offered back`);
  }
  // The inspector writes through the one working document's own commit. What
  // the screen mounts moved at `APP3-S05-C1` — the inspector direct before it,
  // the tier placement authority after — so the rule asks the world it is in
  // rather than pinning the name S05 shipped with.
  if (!/StudioText(Inspector|Panel)/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the text inspector is not mounted`);
  }
  if (!code(rootDir, 'controller').includes('ruleOnTextCandidate')) {
    fail(`${CANONICAL_FILES.controller}: commits a text candidate without ruling on it`);
  }
  // A composition in progress is never a candidate.
  if (!code(rootDir, 'controller').includes('composing')) {
    fail(`${CANONICAL_FILES.controller}: is not composition-aware`);
  }
}

/** Nothing a later checkpoint owns arrived early. */
export function checkNonScope(rootDir, fail) {
  const feature = featureCode(rootDir);

  /*
   * The watermark moved owner rather than losing its rule (`APP3-S09`).
   *
   * It was banned feature-wide while S09 had not opened. The rule is now on the
   * **construction** rather than the word, so the text inspector may not build
   * one and the composition may still mount the one S09 owns.
   */
  const watermarkScope = isS09Delivered(rootDir) ? preS09Code(rootDir) : feature;
  for (const construction of ['studio-watermark__', 'mintWatermarkToken', 'watermarkTiles(']) {
    if (watermarkScope.includes(construction)) {
      fail(`${FEATURE}: builds a watermark outside the four files APP3-S09 owns`);
    }
  }
  const forbidden = Object.freeze({
    'APP3-S10 autosave': ['publicDesignSessionAutosave', 'autosave', 'setInterval('],
    'APP3-S08 history': ['undoStack', 'redoStack', 'historyStack', 'pushHistory'],
    'APP3-S04 layers': ['reorderElement', 'moveLayer', 'toggleLock', 'toggleVisibility'],
    'APP3-S06 upload': ['uploadAsset', 'FormData', 'publicDesignSessionAssetUpload'],
    'APP3-S11 touch': ['bottomSheet', 'touchAction', 'onTouchStart'],
  });
  for (const [owner, needles] of Object.entries(forbidden)) {
    for (const needle of needles) {
      if (feature.includes(needle)) {
        fail(`${FEATURE}: ${owner} arrived early (${needle})`);
      }
    }
  }
}
