#!/usr/bin/env node
/**
 * `APP3-P02` — the production geometry foundation.
 *
 * `IMP-D045` exists because a v1 Design Document records **no pivot, no
 * composition order and no stroke rule**, and its SHA-256 cannot supply them —
 * the hash is over the bytes, not the interpretation. The ruling is authority;
 * this gate keeps the implementation attached to it.
 *
 * So the checks assert *semantics*, not the presence of a function: a
 * `getElementBounds` that silently switched to the untransformed box would still
 * export the right name. Each names the alternative it refuses — corner pivot,
 * `child × parent`, post-transform stroke, a parent chosen by claim order —
 * because a rule stated without its negation is half a rule.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-p02.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3G05 } from './check-app3-g05.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE_DIR = 'packages/design-engine';
export const SRC_DIR = `${PACKAGE_DIR}/src`;
export const DOCUMENT_SRC = 'packages/design-document/src';

/** Modules whose content this gate reads directly. */
export const CANONICAL_FILES = Object.freeze({
  index: `${SRC_DIR}/index.ts`,
  matrix: `${SRC_DIR}/geometry/matrix.ts`,
  quantized: `${SRC_DIR}/geometry/quantized.ts`,
  graph: `${SRC_DIR}/transforms/graph.ts`,
  envelope: `${SRC_DIR}/bounds/envelope.ts`,
  bounds: `${SRC_DIR}/bounds/bounds.ts`,
  authority: `${SRC_DIR}/placement/authority.ts`,
  units: `${SRC_DIR}/placement/units.ts`,
  containment: `${SRC_DIR}/containment/area.ts`,
  graphSpec: `${SRC_DIR}/transforms/graph.spec.ts`,
  manifest: `${PACKAGE_DIR}/package.json`,
});

const words = (list) => Object.freeze(list.split(' '));

const FORBIDDEN_SPECIFIERS = words(
  'react next @nestjs konva fabric interact.js @embroidery/database ' +
    '@embroidery/persistence @embroidery/object-storage spikes/',
);

/** Public API the package must expose for its consumers to exist at all. */
const REQUIRED_EXPORTS = words(
  'identityMatrix translationMatrix rotationClockwiseMatrix scaleMatrix multiplyMatrices ' +
    'invertMatrix transformPoint transformVector localMatrix resolveEffectiveTransform ' +
    'localEnvelope getElementBounds getGroupBounds getDocumentBounds unionBounds ' +
    'intersectBounds containsPoint containsBounds validatePlacementSnapshot pxToMm mmToPx ' +
    'sizePxToMm sizeMmToPx validateProductSideScaleConsistency ' +
    'validateElementWithinEmbroideryArea validateDocumentWithinEmbroideryArea ' +
    'validateElementPhysicalSize',
);

const REQUIRED_CODES = words(
  'INVALID_GEOMETRY SINGULAR_TRANSFORM UNKNOWN_ELEMENT INVALID_PARENT_CHAIN ' +
    'PLACEMENT_SIDE_MISMATCH PLACEMENT_AREA_MISMATCH PLACEMENT_AUTHORITY_MISMATCH ' +
    'PLACEMENT_RETIRED PX_PER_MM_MISMATCH ELEMENT_OUT_OF_BOUNDS ELEMENT_PHYSICAL_SIZE_EXCEEDED',
);

function read(rootDir, relative) {
  const path = join(rootDir, relative);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with comments removed, so prose explaining a rule cannot trip it. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(rootDir, accept, { base = SRC_DIR, skipTesting = false } = {}) {
  const found = [];
  const walk = (directory) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!(skipTesting && entry.name === 'testing')) walk(full);
      } else if (extname(entry.name) === '.ts' && accept(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(join(rootDir, base));
  return found;
}

const productionFiles = (rootDir) =>
  sourceFiles(rootDir, (name) => !name.endsWith('.spec.ts'), { skipTesting: true });

/** 1, 16 — the package is implemented and carries its own tests. */
function checkPackagePresence(rootDir, fail) {
  const index = read(rootDir, CANONICAL_FILES.index);
  if (index === undefined) {
    fail(`${CANONICAL_FILES.index} is missing`);
    return false;
  }
  if (/export\s*\{\s*\}/.test(index)) {
    fail(`${CANONICAL_FILES.index} is still the empty stub — APP3-P02 is not implemented`);
    return false;
  }
  const specs = sourceFiles(rootDir, (name) => name.endsWith('.spec.ts'));
  if (specs.length < 4) {
    fail(`the package carries only ${String(specs.length)} test file(s); expected focused suites`);
  }
  const manifest = read(rootDir, CANONICAL_FILES.manifest) ?? '';
  for (const script of ['test', 'build', 'typecheck']) {
    if (!new RegExp(`"${script}"\\s*:`).test(manifest))
      fail(`the manifest has no ${script} script`);
  }
  if (!manifest.includes('"@embroidery/design-document": "workspace:*"')) {
    fail('the manifest does not declare @embroidery/design-document as a production dependency');
  }
  for (const name of REQUIRED_EXPORTS) {
    if (!index.includes(name)) fail(`the package root does not export ${name}`);
  }
  // Typed findings must all exist, or a caller cannot switch on them.
  const findings = read(rootDir, `${SRC_DIR}/findings/finding.ts`) ?? '';
  for (const name of REQUIRED_CODES) {
    if (!findings.includes(`'${name}'`)) fail(`the finding union is missing ${name}`);
  }
  return true;
}

/** 3, 4 — only the public design-document boundary; nothing else. */
function checkBoundaries(rootDir, fail) {
  for (const file of productionFiles(rootDir)) {
    const source = readFileSync(file, 'utf8');
    const shown = file.slice(rootDir.length + 1);
    for (const match of code(source).matchAll(/from\s+'([^']+)'/g)) {
      const specifier = match[1] ?? '';
      if (specifier.startsWith('.') || specifier === '@embroidery/design-document') continue;
      fail(`${shown} imports "${specifier}"; only the design-document public root is allowed`);
    }
    if (/@embroidery\/design-document\//.test(code(source))) {
      fail(`${shown} deep-imports into design-document instead of its public root`);
    }
    for (const specifier of FORBIDDEN_SPECIFIERS) {
      if (code(source).toLowerCase().includes(`from '${specifier}`)) {
        fail(`${shown} imports the forbidden module "${specifier}"`);
      }
    }
    if (/from\s+'node:/.test(code(source))) {
      fail(`${shown} imports a Node built-in; the package must stay browser-safe`);
    }
    if (/^(let|var)\s+/m.test(code(source))) fail(`${shown} declares module-level mutable state`);
  }
}

/** 5 — the matrix contract and parent × child composition. */
function checkMatrixSemantics(rootDir, fail) {
  const matrix = code(read(rootDir, CANONICAL_FILES.matrix) ?? '');
  const graph = code(read(rootDir, CANONICAL_FILES.graph) ?? '');

  // Clockwise under y-down means b = +sin and c = -sin. Reversing them is the
  // anticlockwise matrix and would rotate every stored design the wrong way.
  if (!/b:\s*sin/.test(matrix) || !/c:\s*normalize\(-sin\)/.test(matrix)) {
    fail('rotationClockwiseMatrix does not use a = cos, b = sin, c = -sin, d = cos');
  }
  // x' = a*x + c*y + e. Row-vector semantics would pair a with b instead.
  if (!/matrix\.a \* point\.x \+ matrix\.c \* point\.y \+ matrix\.e/.test(matrix)) {
    fail('transformPoint does not use column-vector semantics');
  }
  const order =
    /translationMatrix\(\s*transform\.x \+ halfWidth[\s\S]{0,200}?rotationClockwiseMatrix[\s\S]{0,120}?scaleMatrix[\s\S]{0,160}?translationMatrix\(\s*-halfWidth/;
  if (!order.test(matrix)) {
    fail('localMatrix is not T(centre) x R x S x T(-half): scale must precede rotation');
  }
  // Parent outermost: the chain is reversed to root-first before composing.
  if (!/reverse\(\)/.test(graph) || !/composeMatrices\(\.\.\.matrices\)/.test(graph)) {
    fail('resolveEffectiveTransform does not compose parent x child, parent outermost');
  }
}

/** 6, 7, 8 — the local envelope of every kind, and expand-before-transform. */
function checkEnvelopes(rootDir, fail) {
  const envelope = code(read(rootDir, CANONICAL_FILES.envelope) ?? '');
  const bounds = code(read(rootDir, CANONICAL_FILES.bounds) ?? '');

  for (const [token, complaint] of [
    ["RECTANGLE_LINE_JOIN = 'miter'", 'the rectangle miter join'],
    ['RECTANGLE_MITER_LIMIT = 4', 'the rectangle miterLimit of 4'],
    ["LINE_CAP = 'round'", 'the round line cap'],
    ["LINE_JOIN = 'round'", 'the round line join'],
    ["FREEHAND_CAP = 'round'", 'the round freehand cap'],
    ["FREEHAND_JOIN = 'round'", 'the round freehand join'],
  ]) {
    if (!envelope.includes(token)) fail(`the envelope module does not fix ${complaint}`);
  }
  if (!/strokeWidthPx\s*\/\s*2/.test(envelope)) {
    fail('the envelope module does not expand by half the stroke width');
  }
  // Text and image must return the declared box, never an expanded one.
  if (!/case 'text':[\s\S]{0,60}case 'image':[\s\S]{0,40}return box;/.test(envelope)) {
    fail('text and image do not use their declared box unexpanded');
  }
  if (!/x:\s*box\.maxX,\s*y:\s*box\.maxY/.test(envelope)) {
    fail('the v1 line path is not (0,0) to (width,height)');
  }
  // Expand first, then transform: the corners fed to the matrix are the
  // envelope's, not the declared box's.
  if (!/boundsCorners\(envelope\)/.test(bounds)) {
    fail('bounds does not transform the corners of the local envelope');
  }
  if (/expandBounds\([\s\S]{0,60}transformPoint/.test(bounds)) {
    fail('bounds appears to expand after transforming, which ignores scale and rotation');
  }
}

/** 10, 11, 12, 13, 14 — scale authority, modes, containment and physical size. */
function checkValidation(rootDir, fail) {
  const units = code(read(rootDir, CANONICAL_FILES.units) ?? '');
  const authority = code(read(rootDir, CANONICAL_FILES.authority) ?? '');
  const containment = code(read(rootDir, CANONICAL_FILES.containment) ?? '');
  const quantized = code(read(rootDir, CANONICAL_FILES.quantized) ?? '');

  if (!/pxPerMm/.test(units) || !/side\.pxPerMm/.test(units)) {
    fail('px/mm conversion does not use Product Side pxPerMm');
  }
  for (const forbidden of ['96', 'boundWidthPx', 'maxWidthMm /']) {
    if (units.includes(forbidden)) {
      fail(
        `px/mm conversion references "${forbidden}"; the sole source is product_sides.px_per_mm`,
      );
    }
  }
  for (const mode of ['NEW_EDITING', 'HISTORICAL_RENDER']) {
    if (!authority.includes(mode)) fail(`placement validation does not expose ${mode}`);
  }
  if (/supersededById/.test(authority)) {
    fail('placement validation follows a replacement chain, which PO-11 forbids');
  }
  if (!/containsBounds\(limits, box\)/.test(containment)) {
    fail('containment does not require the full transformed AABB inside the area');
  }
  for (const forbidden of ['clamp', 'snap', 'translateInto']) {
    if (containment.toLowerCase().includes(forbidden)) {
      fail(`containment references "${forbidden}"; it must report, never move`);
    }
  }
  if (!/side\.pxPerMm/.test(containment)) {
    fail('physical-size validation does not use Product Side pxPerMm');
  }
  // A second precision, or an epsilon anywhere near a comparison.
  if (/=\s*10_?000\b/.test(quantized)) {
    fail('the package restates the quantization scale instead of reusing P01 authority');
  }
  for (const file of productionFiles(rootDir)) {
    const source = code(readFileSync(file, 'utf8'));
    const shown = file.slice(rootDir.length + 1);
    if (/EPSILON|1e-6|1e-9|0\.0001\b/.test(source)) {
      fail(`${shown} introduces an epsilon; comparisons are exact after quantization`);
    }
    if (/\b96\b\s*(\/|\*)/.test(source)) fail(`${shown} appears to use a 96 DPI constant`);
  }
}

/** 15, 17 — nothing leaked into design-document, and no API/worker/UI here. */
function checkScope(rootDir, fail) {
  for (const file of productionFiles(rootDir)) {
    const source = code(readFileSync(file, 'utf8'));
    const shown = file.slice(rootDir.length + 1);
    for (const token of ['@Controller', '@Injectable', '@Module', 'useState(', 'jsx']) {
      if (source.includes(token)) fail(`${shown} contains ${token}; P02 delivers no API or UI`);
    }
  }
  // The document package must not have grown geometry of its own.
  const documentFiles = sourceFiles(rootDir, (name) => !name.endsWith('.spec.ts'), {
    base: DOCUMENT_SRC,
  });
  for (const file of documentFiles) {
    const source = code(readFileSync(file, 'utf8'));
    for (const token of ['Math.cos', 'Math.sin', 'Math.atan', 'Math.hypot', 'getElementBounds']) {
      if (source.includes(token)) {
        fail(`${file.slice(rootDir.length + 1)} gained geometry (${token}); that belongs to P02`);
      }
    }
  }
}

/**
 * 9 — a group's persisted box is its pivot, never its bounds — and `APP3-P02-C1`:
 * ambiguous parentage is refused, not resolved.
 *
 * The delivered graph kept whichever group claimed a child first. An element with
 * two parents has no authoritative transform, so any winner rule makes stored
 * geometry depend on serialization order and hides an upstream validation bypass.
 * Both halves are asserted — ambiguity is detected *before* a parent map exists,
 * and no consumer can measure anything once it has been.
 */
function checkGroupSemantics(rootDir, fail) {
  const raw = read(rootDir, CANONICAL_FILES.graph) ?? '';
  const graph = code(raw);
  const bounds = code(read(rootDir, CANONICAL_FILES.bounds) ?? '');
  const spec = read(rootDir, CANONICAL_FILES.graphSpec) ?? '';
  const complain = (message) => fail(`ambiguous parentage: ${message}`);

  // The call, not the identifier: an unused import would otherwise satisfy this.
  if (!/drawableDescendants\(/.test(bounds)) fail('getGroupBounds does not union descendants');
  if (/localEnvelope\(group\)/.test(bounds)) {
    fail('getGroupBounds uses the group persisted box as visible geometry');
  }
  for (const token of ['rebase', 'flatten']) {
    if (graph.toLowerCase().includes(token)) fail(`the graph module appears to ${token} children`);
  }
  for (const [pattern, complaint] of [
    [/listedHere\.has\(childId\)/, 'a child repeated inside one group is not rejected'],
    [/claiming\.size > 1/, 'a child claimed by two groups is not rejected'],
    [/childId === element\.id/, 'a group claiming itself is not rejected'],
    [/!byId\.has\(childId\)/, 'an unknown child reference is not rejected'],
    [
      /structuralFindings\.length === 0\s*\)\s*\{\s*for \(const \[childId, claiming\]/,
      'the parent map is built before every claim is known unambiguous',
    ],
    [/'INVALID_PARENT_CHAIN'/, 'the graph module does not raise INVALID_PARENT_CHAIN'],
  ]) {
    if (!pattern.test(graph)) complain(complaint);
  }
  // The old rule, in the exact form it took: insert unless already claimed.
  if (/!parentOf\.has\(childId\)/.test(graph)) {
    complain('the graph still selects a parent by claim order');
  }
  const containment = code(read(rootDir, CANONICAL_FILES.containment) ?? '');
  for (const [name, source] of Object.entries({ bounds, containment })) {
    if (!/structuralFinding\(/.test(source)) {
      complain(`${name} can proceed on a graph with no authoritative parentage`);
    }
  }
  // Prose counts: a comment promising a winner documents the defect as design.
  for (const claim of ['first parent wins', 'last parent wins', 'first wins', 'last wins']) {
    if (`${raw}${spec}`.toLowerCase().includes(claim)) complain(`a module claims "${claim}"`);
  }
  for (const proof of [
    'rejects one group listing the same child twice',
    'rejects two groups claiming one child',
    'selects no winner in either order',
  ]) {
    if (!spec.includes(proof)) complain(`the regression "${proof}" is missing`);
  }
  if (spec.includes('keeps only the first parent')) {
    complain('the first-parent determinism test was renamed, not replaced');
  }
}

export function checkApp3P02(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  if (checkPackagePresence(rootDir, fail)) {
    checkBoundaries(rootDir, fail);
    checkMatrixSemantics(rootDir, fail);
    checkEnvelopes(rootDir, fail);
    checkGroupSemantics(rootDir, fail);
    checkValidation(rootDir, fail);
    checkScope(rootDir, fail);
  }

  // 2, 18 — G05 chains P01, which chains F01/DB01 → G04 → G03 → G02 → G01, so
  // one call asserts the whole accepted authority this package implements.
  for (const violation of checkApp3G05(rootDir)) fail(`APP3-G05 regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3P02(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-p02 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-p02 — design-engine implements IMP-D045: clockwise rotation under y-down, ' +
      'T(centre) x R x S x T(-half) with scale first, effective transforms composed parent ' +
      'outermost, stroke-aware local envelopes expanded before they are transformed, group ' +
      'bounds as the descendant union, ambiguous parentage refused rather than resolved by ' +
      'claim order (APP3-P02-C1), product_sides.px_per_mm as the sole conversion authority, ' +
      'and blocking full-AABB containment that never clamps; only the design-document public ' +
      'root is imported, no epsilon or DPI constant exists, and no geometry entered ' +
      'design-document',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
