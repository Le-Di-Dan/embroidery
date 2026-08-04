/**
 * The `IMP-D047` sanitization policy itself, checked against the phase plan.
 *
 * Split out of `check-app3-g07.mjs` because it is a different kind of check: the
 * rest of that gate reconciles tables and asserts the repository stayed
 * untouched, while everything here reads one long prose ruling and proves each
 * individual allowlist entry, refusal, grammar rule, limit and pipeline step is
 * actually written down. That is the half a later edit would erode one line at a
 * time, so it gets its own file and its own cases.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SANITIZER_RULES = Object.freeze({
  sanitizerVersion: '3.4.13',
  domVersion: '29.1.1',
  rejectedDomVersion: '30.0.1',
  lockedRuntime: '22.14.0',
  policyVersion: 1,
  outcome: 'UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG',
  elements: ['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'],
  rootAttributes: ['xmlns', 'viewBox'],
  attributes: [
    'transform',
    'fill',
    'fill-opacity',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-dasharray',
    'stroke-dashoffset',
    'opacity',
    'x',
    'y',
    'width',
    'height',
    'rx',
    'ry',
    'cx',
    'cy',
    'r',
    'x1',
    'y1',
    'x2',
    'y2',
    'points',
    'd',
  ],
  transforms: ['matrix', 'translate', 'scale', 'rotate', 'skewX', 'skewY'],
});

/** The §6.17.1 facts, recomputed from the bounded table. */
export const EXPECTED_FACTS = Object.freeze({
  Sanitizer: 'DOMPURIFY_ON_JSDOM',
  'Sanitizer package': 'dompurify',
  'Sanitizer version': SANITIZER_RULES.sanitizerVersion,
  'Sanitizer license': 'MPL-2.0 OR Apache-2.0',
  'Sanitizer runtime dependencies': '0',
  'Sanitizer repository': 'https://github.com/cure53/DOMPurify',
  'DOM package': 'jsdom',
  'DOM version': SANITIZER_RULES.domVersion,
  'DOM license': 'MIT',
  'DOM repository': 'https://github.com/jsdom/jsdom',
  'Locked worker runtime': SANITIZER_RULES.lockedRuntime,
  'Latest jsdom': SANITIZER_RULES.rejectedDomVersion,
  'Latest jsdom usable': 'NO_LOCKED_RUNTIME_TOO_OLD',
  'Version range form': 'EXACT_PIN_ONLY',
  'Install or postinstall script': 'NONE',
  'Path data parser': 'PACKAGE_OWNED_DETERMINISTIC_PARSER',
  'Path parser dependency': 'NONE',
  'SVGO role': 'NOT_A_SANITIZER_AND_NOT_RUN_IN_V1',
  'Sharp role': 'NOT_A_SANITIZER_AND_NEVER_RASTERIZES_TEMPLATE_SVG',
  'Regex sanitization': 'FORBIDDEN',
  'Headless browser': 'FORBIDDEN',
  'Sanitization policy version': String(SANITIZER_RULES.policyVersion),
  'Sanitization policy persistence': 'WORKER_POLICY_NOT_DATABASE',
  'New derivative kind': 'NONE',
  'G07 dependency install': 'NONE',
  'G07 application change': 'NONE',
});

/** The §6.17.2 ruling body — the prose every check below reads. */
function rulings(rootDir, files) {
  const path = join(rootDir, files.phase);
  if (!existsSync(path)) return '';
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf('### 6.17.2 ');
  if (start < 0) return '';
  const rest = text.slice(start);
  // Ends at §6.17.3: the corpus is checked separately, and letting its long
  // list of attack names satisfy a ruling check would make several of these
  // assertions pass for the wrong reason.
  const end = rest.indexOf('### 6.17.3 ');
  // Whitespace-collapsed: the rulings are prose wrapped at 80 columns, so where
  // a sentence happens to break must never decide whether a rule is recorded.
  return (end < 0 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

/** The §6.17.3 corpus body — the cases APP3-W01B must carry. */
function corpus(rootDir, files) {
  const path = join(rootDir, files.phase);
  if (!existsSync(path)) return '';
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf('### 6.17.3 ');
  if (start < 0) return '';
  const rest = text.slice(start);
  const end = rest.indexOf('### 6.17.4 ');
  return (end < 0 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

/**
 * The locked security corpus.
 *
 * A sanitizer without a regression corpus is a claim, not a control: the one
 * thing that catches a policy that silently stopped rejecting something is a
 * fixture that used to fail. So the families are named here, and the
 * determinism requirement is named with them.
 */
function checkCorpus(rootDir, files, fail) {
  const text = corpus(rootDir, files);
  if (text === '') {
    fail(`${files.phase}: §6.17.3 is missing; the security corpus is not locked`);
    return;
  }
  for (const family of [
    'script',
    'foreignObject',
    'xlink:href',
    'protocol-relative',
    'CSS `url()`',
    'text and fonts',
    'animation',
    'filters, masks',
    'XXE',
    'namespace confusion',
    'multiple roots',
    'oversized',
    'arc flags',
    'overflow',
    'DOM-clobbering',
    'encoding and case evasions',
    'mutation-XSS',
    'parser-differential',
    'official DOMPurify SVG regression fixtures',
  ]) {
    if (!text.includes(family)) {
      fail(`§6.17.3 does not lock the "${family}" rejection family`);
    }
  }
  for (const [needle, complaint] of [
    ['Acceptance cases', 'the acceptance half of the corpus'],
    ['limit boundaries', 'the boundary acceptance cases'],
    ['SHA-256 determinism', 'the determinism requirement'],
    ['fresh processes', 'the fresh-process requirement'],
    ['fixed-point equality', 'the fixed-point requirement'],
  ]) {
    if (!text.includes(needle)) fail(`§6.17.3 does not require ${complaint}`);
  }
}

/** Every allowed name, every refusal, the grammar, the limits, the pipeline. */
export function checkSanitizerPolicy(rootDir, files, fail) {
  const text = rulings(rootDir, files);
  if (text === '') {
    fail(`${files.phase}: §6.17.2 is missing; the rulings are not recorded`);
    return;
  }
  const has = (needle) => text.includes(needle);

  // Architecture, and the five refused alternatives.
  for (const needle of ['DOMPurify', 'jsdom', 'server-side']) {
    if (!has(needle)) fail(`§6.17.2 does not lock the ${needle} architecture`);
  }
  for (const forbidden of [
    'isomorphic-dompurify',
    'sanitize-svg',
    'regex-only sanitization',
    'headless browser',
    'SVGO',
    'Sharp',
  ]) {
    if (!has(forbidden)) fail(`§6.17.2 does not refuse "${forbidden}" by name`);
  }
  for (const needle of ['`*`', '`latest`', 'caret', 'tilde']) {
    if (!has(needle)) fail(`§6.17.2 does not forbid the ${needle} version form`);
  }

  // DOMPurify's defaults are not the policy, and `removed` is not the decision.
  for (const [needle, complaint] of [
    ['PARSER_MEDIA_TYPE', 'XML parser mode'],
    ['HTML and MathML disabled', 'the HTML/MathML refusal'],
    ['DOMPurify.removed', 'the diagnostic-only rule for `removed`'],
    ['diagnostic only', 'that `removed` is never the security decision'],
  ]) {
    if (!has(needle)) fail(`§6.17.2 does not state ${complaint}`);
  }

  // Input form and whole-file rejection.
  for (const [needle, complaint] of [
    ['1 MiB', 'the source byte limit'],
    ['strict XML parsing', 'strict XML parsing'],
    ['never HTML error recovery', 'the refusal of HTML recovery'],
    ['http://www.w3.org/2000/svg', 'the root namespace'],
    ['no foreign namespace', 'the foreign-namespace refusal'],
    ['DOCTYPE', 'the DOCTYPE refusal'],
    ['external entity resolution', 'the external-entity refusal'],
    [SANITIZER_RULES.outcome, 'the whole-file rejection outcome'],
    ['never silently removed', 'that content is never silently removed'],
  ]) {
    if (!has(needle)) fail(`§6.17.2 does not state ${complaint}`);
  }

  checkAllowlists(text, fail);
  checkGrammarAndLimits(text, fail);
  checkPipelineAndOutput(text, fail);
  checkCorpus(rootDir, files, fail);
}

/** The element and attribute allowlists, and the always-rejected names. */
function checkAllowlists(text, fail) {
  for (const element of SANITIZER_RULES.elements) {
    if (!text.includes(`\`${element}\``)) fail(`§6.17.2 does not allow the element "${element}"`);
  }
  for (const element of [
    'script',
    'foreignObject',
    'image',
    'style',
    'use',
    'symbol',
    'defs',
    'marker',
    'pattern',
    'mask',
    'clipPath',
    'metadata',
    'title',
    'desc',
  ]) {
    if (!text.includes(`\`${element}\``)) fail(`§6.17.2 does not reject "${element}" by name`);
  }
  for (const attribute of SANITIZER_RULES.attributes) {
    if (!text.includes(`\`${attribute}\``)) {
      fail(`§6.17.2 does not allow the attribute "${attribute}"`);
    }
  }
  for (const attribute of [
    'id',
    'class',
    'style',
    'href',
    'xlink:href',
    'src',
    'on*',
    'data-*',
    'aria-*',
    'tabindex',
    'role',
    'xml:base',
    'xml:space',
    'vector-effect',
  ]) {
    if (!text.includes(`\`${attribute}\``)) fail(`§6.17.2 does not reject "${attribute}" by name`);
  }
  if (!text.includes('DOM-clobbering'))
    fail('§6.17.2 does not tie rejecting `id` to DOM clobbering');
}

/** URLs, CSS, fonts, the value grammar, transforms, viewBox, paths and limits. */
function checkGrammarAndLimits(text, fail) {
  for (const scheme of [
    'url(...)',
    'var(...)',
    'javascript:',
    'data:',
    'blob:',
    'http:',
    'https:',
    'ftp:',
    'file:',
    'cid:',
    'protocol-relative',
    '#fragment',
  ]) {
    if (!text.includes(scheme)) fail(`§6.17.2 does not reject "${scheme}"`);
  }
  for (const [needle, complaint] of [
    ['currentColor', 'the `currentColor` refusal'],
    ['context-fill', 'the `context-fill` refusal'],
    ['remote or embedded font', 'the font refusal'],
    ['no text rendering', 'the text-rendering refusal'],
    ['NaN', 'the NaN refusal'],
    ['Infinity', 'the Infinity refusal'],
    ['calc()', 'the calc() refusal'],
    ['percentage', 'the percentage refusal'],
    ['#rrggbbaa', 'the canonical paint forms'],
    ['nonzero', 'the fill-rule enumeration'],
    ['evenodd', 'the fill-rule enumeration'],
    ['butt', 'the stroke-linecap enumeration'],
    ['bevel', 'the stroke-linejoin enumeration'],
    ['0..1', 'the opacity range'],
    ['non-negative', 'the non-negative stroke rule'],
    ['4096', 'the viewBox dimension ceiling'],
    ['16,777,216', 'the viewBox area ceiling'],
    ['width_px = viewBox width', 'the viewBox-derived width'],
    ['height_px = viewBox height', 'the viewBox-derived height'],
    ['no rounding', 'the no-rounding rule'],
    ['M/L/H/V/C/S/Q/T/A/Z', 'the path command set'],
    ['arc flags', 'the arc-flag rule'],
    ['permissive character regex is forbidden', 'the regex-path refusal'],
    ['package-owned', 'the path parser ownership'],
    ['10,000', 'the node limit'],
    ['1,000,000', 'the path-data character limit'],
    ['depth 64', 'the depth limit'],
    ['boundary plus one rejects', 'the boundary rule'],
    ['truncated into compliance', 'the no-truncation rule'],
  ]) {
    if (!text.includes(needle)) fail(`§6.17.2 does not state ${complaint}`);
  }
  for (const fn of SANITIZER_RULES.transforms) {
    if (!text.includes(`\`${fn}(`)) fail(`§6.17.2 does not allow the transform "${fn}"`);
  }
  for (const [needle, complaint] of [
    ['no CSS transform syntax', 'the CSS-transform refusal'],
    ['no 3D', 'the 3D refusal'],
    ['transform-origin', 'the transform-origin refusal'],
    ['order is preserved', 'transform order preservation'],
  ]) {
    if (!text.includes(needle)) fail(`§6.17.2 does not state ${complaint}`);
  }
}

/** The thirteen-step pipeline, the fixed point and the canonical output form. */
function checkPipelineAndOutput(text, fail) {
  for (let step = 1; step <= 13; step += 1) {
    if (!text.includes(`(${String(step)})`))
      fail(`§6.17.2 pipeline step ${String(step)} is missing`);
  }
  for (const [needle, complaint] of [
    ['sanitize again', 'the second sanitize pass'],
    ['second bytes to equal the first', 'the fixed-point equality'],
    ['No mutation and no optimizer after the final pass', 'the no-post-mutation rule'],
    ['media_type = image/svg+xml', 'the output media type'],
    ['no BOM', 'the BOM rule'],
    ['XML declaration omitted', 'the XML-declaration rule'],
    ['LF line endings', 'the line-ending rule'],
    ['no trailing newline', 'the trailing-newline rule'],
    ['lexicographically', 'the attribute ordering'],
    ['empty-element form', 'the empty-element form'],
    ['explicit start and end tags', 'the explicit svg/g tags'],
    ['byte-identical', 'the determinism definition'],
    ['does **not** mean', 'the limit of the determinism claim'],
    [
      `TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = ${String(SANITIZER_RULES.policyVersion)}`,
      'the policy version',
    ],
    ['never a database column', 'that the policy is not a database column'],
    ['security review', 'the change-control rule'],
    ['exact lockfile integrity', 'the lockfile integrity rule'],
    ['no runtime network call', 'the no-network rule'],
    ['no native binary', 'the no-native-binary rule'],
    ['unapproved install script', 'the install-script rule'],
    ['private, unwatermarked', 'the delivery boundary'],
    ['no public ACL', 'the public-ACL refusal'],
    ['download endpoint', 'the download-endpoint refusal'],
  ]) {
    if (!text.includes(needle)) fail(`§6.17.2 does not state ${complaint}`);
  }
}
