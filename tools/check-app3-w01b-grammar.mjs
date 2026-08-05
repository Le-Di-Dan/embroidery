#!/usr/bin/env node
/**
 * `APP3-W01B` — the closed grammar: allowlists, parsers, ceilings, input form,
 * canonical output and the corpus that proves them.
 *
 * Split from `check-app3-w01b.mjs` by responsibility. That file asserts the
 * *machinery* — which packages, which parser, which sanitizer configuration,
 * which pipeline — and this one asserts the **policy those machines apply**:
 * exactly nine elements, a closed attribute set, a validator per value, four
 * ceilings whose boundary is exact, and a serializer with one spelling for
 * everything it could otherwise choose.
 *
 * It also owns the canonical file map, so the dependency between the two halves
 * runs one way and there is no cycle.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-w01b-grammar.mjs [rootDir]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JOB_DIR = 'apps/worker/src/jobs/asset-normalization';
const SVG_DIR = `${JOB_DIR}/domain/svg`;

export const CANONICAL_FILES = Object.freeze({
  svgPolicy: `${SVG_DIR}/template-svg-policy.ts`,
  number: `${SVG_DIR}/svg-number.ts`,
  paint: `${SVG_DIR}/svg-paint.ts`,
  transform: `${SVG_DIR}/svg-transform.ts`,
  values: `${SVG_DIR}/svg-attribute-values.ts`,
  document: `${SVG_DIR}/svg-document.ts`,
  builder: `${SVG_DIR}/svg-document-builder.ts`,
  serializer: `${SVG_DIR}/svg-serializer.ts`,
  sourceForm: `${SVG_DIR}/svg-source-form.ts`,
  tokenizer: `${SVG_DIR}/path/path-tokenizer.ts`,
  pathParser: `${SVG_DIR}/path/path-parser.ts`,
  pathSerializer: `${SVG_DIR}/path/path-serializer.ts`,
  jsdomParser: `${JOB_DIR}/infrastructure/svg/jsdom-svg-parser.ts`,
  purifier: `${JOB_DIR}/infrastructure/svg/dompurify-svg-sanitizer.ts`,
  pipeline: `${JOB_DIR}/application/template-svg-sanitizer.ts`,
  service: `${JOB_DIR}/application/template-svg-normalization.service.ts`,
  writer: `${JOB_DIR}/application/derivative-object-writer.ts`,
  derivative: `${JOB_DIR}/application/normalized-derivative.service.ts`,
  usecase: `${JOB_DIR}/application/asset-normalization.usecase.ts`,
  outcome: `${JOB_DIR}/domain/normalization-outcome.ts`,
  policy: `${JOB_DIR}/domain/normalization-policy.ts`,
  module: `${JOB_DIR}/asset-normalization.module.ts`,
  rejectionCorpus: `${JOB_DIR}/application/template-svg-sanitizer.rejection.spec.ts`,
  acceptanceCorpus: `${JOB_DIR}/application/template-svg-sanitizer.acceptance.spec.ts`,
  integration: `${JOB_DIR}/tests/template-svg-normalization.integration.spec.ts`,
  determinism: 'apps/worker/test/process/template-svg-determinism.process.spec.ts',
  workerManifest: 'apps/worker/package.json',
  dockerfile: 'infrastructure/docker/worker.Dockerfile',
});

/** The exact pins `IMP-D047` locked. No caret, tilde, wildcard or `latest`. */
export const EXACT_PINS = Object.freeze({ dompurify: '3.4.13', jsdom: '29.1.1' });

/** The nine allowed elements (PO-06). */
const ELEMENTS = Object.freeze([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);

/**
 * The complexity ceilings (PO-11), as they must appear in the policy.
 *
 * Each pattern ends at the trailing comma. Without it, `maxDepth: 64` matches
 * inside `maxDepth: 640` and a tenfold widening passes the gate — which is
 * exactly what the regression suite caught.
 */
const LIMITS = Object.freeze([
  ['maxSourceBytes: 1024 \\* 1024,', '1 MiB source ceiling'],
  ['maxElements: 10_000,', 'the 10,000-element ceiling'],
  ['maxPathDataChars: 1_000_000,', 'the 1,000,000-character path ceiling'],
  ['maxDepth: 64,', 'the depth ceiling of 64'],
  ['maxWidth: 4096,', 'the 4096 viewBox width ceiling'],
  ['maxHeight: 4096,', 'the 4096 viewBox height ceiling'],
  ['maxPixels: 16_777_216,', 'the 16,777,216 pixel budget'],
]);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with comments removed, so prose explaining a rule cannot trip a scan. */
export function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 1 — the closed allowlists, exactly as PO-06 and PO-07 name them. */
function checkAllowlists(rootDir, fail) {
  const policy = code(read(rootDir, 'svgPolicy') ?? '');

  for (const element of ELEMENTS) {
    if (!new RegExp(`'${element}',`).test(policy)) fail(`the element allowlist omits "${element}"`);
  }
  const declared = /TEMPLATE_SVG_ELEMENTS = \[([\s\S]*?)\] as const/.exec(policy)?.[1] ?? '';
  const count = [...declared.matchAll(/'[a-z]+'/g)].length;
  if (count !== ELEMENTS.length) {
    fail(`the element allowlist holds ${count} names; IMP-D047 locks ${ELEMENTS.length}`);
  }
  if (!/TEMPLATE_SVG_ROOT_ATTRIBUTES = \['xmlns', 'viewBox'\]/.test(policy)) {
    fail('the root attribute set is not exactly xmlns and viewBox');
  }
  for (const attribute of ['id', 'class', 'style', 'href', 'vector-effect', 'tabindex', 'role']) {
    if (new RegExp(`'${attribute}'`).test(policy)) {
      fail(`"${attribute}" appears in the attribute policy; IMP-D047 always rejects it`);
    }
  }

  const builder = code(read(rootDir, 'builder') ?? '');
  if (!/element\.namespaceURI !== SVG_NAMESPACE/.test(builder)) {
    fail('the builder does not require the SVG namespace');
  }
  // Anchored to its own statement: the root's attribute reader also compares a
  // namespace, and a bare match would be satisfied by that one alone.
  if (!/^\s*if \(attribute\.namespaceURI !== null\) return undefined;$/m.test(builder)) {
    fail('the builder does not reject namespaced attributes');
  }
  if (!/!isTemplateSvgElementName\(name\)/.test(builder)) {
    fail('the builder does not apply the element allowlist');
  }
}

/** 2 — every value has a real parser, and an unknown attribute has none. */
function checkParsers(rootDir, fail) {
  const values = code(read(rootDir, 'values') ?? '');
  const tokenizer = code(read(rootDir, 'tokenizer') ?? '');
  const pathParser = code(read(rootDir, 'pathParser') ?? '');

  if (!/validator === undefined \? undefined : validator\(value\)/.test(values)) {
    fail('an attribute with no validator is not rejected by default');
  }
  if (!/Number\.isInteger\(width\)/.test(values) || !/Number\.isInteger\(height\)/.test(values)) {
    fail('the viewBox does not require integer dimensions');
  }
  // The package-owned path parser: real grammar, not a permissive regex.
  if (!/readFlag\(\)/.test(tokenizer)) fail('arc flags are not read as single characters');
  if (!/ARC_FLAG_INDEXES/.test(pathParser)) fail('the arc flag positions are not fixed');
  if (!/MOVETO_CONTINUATION/.test(pathParser)) fail('moveto continuation is not implemented');
  for (const command of ['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z']) {
    if (!new RegExp(`^\\s*${command}: \\d`, 'm').test(pathParser)) {
      fail(`the path grammar has no arity for "${command}"`);
    }
  }
  const manifest = JSON.parse(read(rootDir, 'workerManifest') ?? '{}');
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (/path|svg-?(parse|path)/.test(name) && !name.startsWith('@embroidery/')) {
      fail(`"${name}" looks like a path-parser dependency; PO-10 requires a package-owned one`);
    }
  }
}

/** 3 — the ceilings, with nothing truncated into compliance. */
function checkLimits(rootDir, fail) {
  const policy = code(read(rootDir, 'svgPolicy') ?? '');
  for (const [pattern, complaint] of LIMITS) {
    if (!new RegExp(pattern).test(policy)) fail(`the policy is missing ${complaint}`);
  }
  const builder = code(read(rootDir, 'builder') ?? '');
  for (const [pattern, complaint] of [
    [/depth > TEMPLATE_SVG_LIMITS\.maxDepth/, 'the depth ceiling'],
    [/elementCount > TEMPLATE_SVG_LIMITS\.maxElements/, 'the element ceiling'],
    [/pathDataChars > TEMPLATE_SVG_LIMITS\.maxPathDataChars/, 'the path-data ceiling'],
  ]) {
    if (!pattern.test(builder)) fail(`the builder does not enforce ${complaint}`);
  }
  const form = code(read(rootDir, 'sourceForm') ?? '');
  if (!/bytes\.length > TEMPLATE_SVG_LIMITS\.maxSourceBytes/.test(form)) {
    fail('the byte ceiling is not enforced before decoding');
  }
  if (/slice\(0, TEMPLATE_SVG_LIMITS|\.splice\(/.test(builder)) {
    fail('the builder truncates rather than rejects');
  }
}

/** 4 — the input form gate runs on bytes, before any parser exists. */
function checkSourceForm(rootDir, fail) {
  const form = code(read(rootDir, 'sourceForm') ?? '');
  if (!/fatal: true/.test(form)) fail('UTF-8 decoding is not fatal');
  if (!/FORBIDDEN_MARKUP = \['<!', '<\?'\]/.test(form)) {
    fail('DOCTYPE, entity, CDATA and processing instructions are not refused by form');
  }
  if (!/BOM/.test(form)) fail('the BOM rule is missing');
}

/** 5 — the canonical output form, byte for byte. */
function checkSerializer(rootDir, fail) {
  const serializer = code(read(rootDir, 'serializer') ?? '');
  const builder = code(read(rootDir, 'builder') ?? '');

  if (!/Buffer\.from\(serializeCanonicalSvg\(root\), 'utf8'\)/.test(serializer)) {
    fail('the canonical bytes are not UTF-8 from the canonical text');
  }
  if (/<\?xml|\\ufeff|\\n'/i.test(serializer)) {
    fail('the serializer emits an XML declaration, a BOM or a newline');
  }
  if (!/escapeAttributeValue/.test(serializer)) fail('attribute values are not XML-escaped');
  if (!/TEMPLATE_SVG_EXPLICIT_CLOSE_ELEMENTS/.test(serializer)) {
    fail('svg and g do not get explicit closing tags');
  }
  if (!/attributes\.sort/.test(builder)) fail('attributes are not sorted deterministically');
  if (!/name: XMLNS, value: SVG_NAMESPACE/.test(builder)) {
    fail('the root xmlns is not synthesized from the namespace');
  }
}

/** 6 — the corpora exist and assert bytes, not snapshots. */
function checkCorpus(rootDir, fail) {
  const rejection = read(rootDir, 'rejectionCorpus') ?? '';
  const acceptance = read(rootDir, 'acceptanceCorpus') ?? '';
  const determinism = read(rootDir, 'determinism') ?? '';

  for (const [needle, complaint] of [
    ['<script>', 'scripts'],
    ['onload=', 'event handlers'],
    ['foreignObject', 'foreign content'],
    ['xlink:href', 'xlink references'],
    ['javascript:', 'the javascript scheme'],
    ['data:image/svg+xml;base64', 'data URLs'],
    ['<style>', 'CSS'],
    ['<text ', 'text'],
    ['<use ', 'use references'],
    ['<animate ', 'animation'],
    ['<filter ', 'filters'],
    ['ENTITY', 'XXE payloads'],
    ['1998/Math/MathML', 'namespace confusion'],
    ['ownerDocument', 'DOM clobbering'],
    ['mXSS', 'mutation-XSS'],
  ]) {
    if (!rejection.includes(needle)) fail(`the rejection corpus does not cover ${complaint}`);
  }

  if (acceptance.includes('toMatchSnapshot')) fail('the acceptance corpus relies on a snapshot');
  for (const [needle, complaint] of [
    ['sha256', 'digest equality'],
    ['re-canonicalizes its own output', 'the fixed point'],
  ]) {
    if (!acceptance.includes(needle)) fail(`the acceptance corpus does not assert ${complaint}`);
  }

  for (const [needle, complaint] of [
    ['fresh host processes', 'fresh-process repetition'],
    ["expect(report.node).toBe('v22.14.0')", 'the locked container Node'],
    [`expect(report.jsdom).toBe('${EXACT_PINS.jsdom}')`, 'the container jsdom pin'],
    ['byte-identical output on Alpine Linux', 'cross-platform byte identity'],
  ]) {
    if (!determinism.includes(needle)) fail(`the determinism proof does not cover ${complaint}`);
  }
}

export function checkApp3W01bGrammar(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkAllowlists(rootDir, fail);
  checkParsers(rootDir, fail);
  checkLimits(rootDir, fail);
  checkSourceForm(rootDir, fail);
  checkSerializer(rootDir, fail);
  checkCorpus(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp3W01bGrammar(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-w01b-grammar — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-w01b-grammar — nine elements and no tenth, a closed attribute set that always ' +
      'rejects id, class, style and href, a validator per value with rejection as the default, ' +
      'integer viewBox dimensions, a package-owned path parser with real arity and ' +
      'single-character arc flags, four ceilings enforced with nothing truncated, a fatal UTF-8 ' +
      'decode that refuses DOCTYPE and processing instructions by form, a canonical serializer ' +
      'with sorted attributes and no declaration, BOM or newline, and a corpus that covers ' +
      'scripts, foreign content, XXE, DOM clobbering and mutation-XSS while asserting bytes ' +
      'rather than snapshots',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
