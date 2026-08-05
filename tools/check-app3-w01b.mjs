#!/usr/bin/env node
/**
 * `APP3-W01B` — the sanitized Template SVG normalization extension.
 *
 * The risk here is not that sanitization breaks; a broken sanitizer refuses
 * everything and is noticed immediately. It is that a later edit makes something
 * *easier* in a way that quietly widens `IMP-D047`: letting `DOMPurify.removed`
 * decide instead of the repository's own validation, dropping the second pass
 * because it "always matches", sharing a window between jobs, or pinning a newer
 * jsdom that the locked container cannot start. Every one of those compiles and
 * passes a happy-path test, and the last one passes every test that is not run
 * in the image.
 *
 * This half asserts the **machinery**: which packages, which parser, which
 * sanitizer configuration, which pipeline. `check-app3-w01b-grammar.mjs` asserts
 * the policy that machinery applies, and `check-app3-w01b-boundaries.mjs`
 * asserts what the checkpoint did not add. All three run from here.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-w01b.mjs [rootDir]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3W01bBoundaries } from './check-app3-w01b-boundaries.mjs';
import {
  CANONICAL_FILES,
  EXACT_PINS,
  REPO_ROOT,
  checkApp3W01bGrammar,
  code,
  read,
} from './check-app3-w01b-grammar.mjs';

export { CANONICAL_FILES, EXACT_PINS, REPO_ROOT };

/** Refused by `IMP-D047` PO-01/PO-03, in the sanitizer role or any other. */
const REFUSED_PACKAGES = Object.freeze([
  'isomorphic-dompurify',
  'happy-dom',
  'svgo',
  'sanitize-svg',
  'xmldom',
  'svg-sanitizer',
  'puppeteer',
  'playwright-core',
]);

/** 1 — every canonical file exists. Everything after depends on it. */
function checkFilesExist(rootDir, fail) {
  for (const [key, path] of Object.entries(CANONICAL_FILES)) {
    if (read(rootDir, key) === undefined) fail(`${path} is missing`);
  }
}

/**
 * 2 — the dependencies are the exact pins, and the locked runtime can start
 * them.
 *
 * The `engines` comparison is the check that would have caught the mistake
 * `IMP-D047` was written to avoid: jsdom 30 compiles, passes every local test
 * and then fails at container start, because `node:22.14.0-alpine` does not
 * satisfy its `engines.node`. Reading the *installed* package's engines against
 * the *Dockerfile's* Node is the only place that disagreement is visible
 * without running a container.
 */
function checkDependencies(rootDir, fail) {
  const manifest = JSON.parse(read(rootDir, 'workerManifest') ?? '{}');
  const dependencies = manifest.dependencies ?? {};

  for (const [name, version] of Object.entries(EXACT_PINS)) {
    const declared = dependencies[name];
    if (declared === undefined) fail(`the worker does not depend on "${name}"`);
    else if (declared !== version) {
      fail(`"${name}" is "${declared}"; IMP-D047 pins exactly "${version}"`);
    }
  }
  for (const name of REFUSED_PACKAGES) {
    if (name in dependencies || name in (manifest.devDependencies ?? {})) {
      fail(`the worker gained "${name}", which IMP-D047 refused`);
    }
  }

  const dockerfile = read(rootDir, 'dockerfile') ?? '';
  const runtime = /FROM node:(\d+\.\d+\.\d+)-alpine/.exec(dockerfile)?.[1];
  if (runtime === undefined) fail('the worker image does not pin a Node version');
  else if (!satisfiesEngines(rootDir, 'jsdom', runtime)) {
    fail(`jsdom's engines.node does not admit the image's Node ${runtime}`);
  }
}

/**
 * A deliberately narrow `engines.node` test: every range in this repository is a
 * disjunction of caret ranges, and a general semver implementation would be a
 * dependency this tool does not have.
 */
function satisfiesEngines(rootDir, name, runtime) {
  const path = join(rootDir, 'node_modules', name, 'package.json');
  if (!existsSync(path)) return true;
  const range = JSON.parse(readFileSync(path, 'utf8')).engines?.node;
  if (typeof range !== 'string') return true;

  const [major, minor, patch] = runtime.split('.').map(Number);
  return range.split('||').some((clause) => {
    const caret = /^\s*\^(\d+)\.(\d+)\.(\d+)\s*$/.exec(clause);
    if (caret !== null) {
      const [, cMajor, cMinor, cPatch] = caret.map(Number);
      if (major !== cMajor) return false;
      if (minor !== cMinor) return minor > cMinor;
      return patch >= cPatch;
    }
    const atLeast = /^\s*>=\s*(\d+)\./.exec(clause);
    return atLeast !== null && major >= Number(atLeast[1]);
  });
}

/** 3 — the sanitization policy version is the event's, not a second number. */
function checkPolicyBinding(rootDir, fail) {
  const svgPolicy = code(read(rootDir, 'svgPolicy') ?? '');
  const service = code(read(rootDir, 'service') ?? '');
  const usecase = code(read(rootDir, 'usecase') ?? '');

  if (!/TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = NORMALIZATION_POLICY_VERSION/.test(svgPolicy)) {
    fail('the sanitization policy version is not defined as the normalization policy version');
  }
  if (/TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = \d/.test(svgPolicy)) {
    fail('the sanitization policy version is a second literal that can drift');
  }
  if (!/requested !== TEMPLATE_SVG_SANITIZATION_POLICY_VERSION/.test(service)) {
    fail('an unsupported policy version is not refused');
  }
  if (!/TEMPLATE_SVG_POLICY_VERSION_UNSUPPORTED/.test(service)) {
    fail('the unsupported-policy-version outcome is not raised');
  }
  // Before the claim and before any read: the assertion has to precede
  // `prepareOrRecover`, or a job for rules this build cannot run takes the row.
  const assertion = usecase.indexOf('assertPolicyVersion');
  const prepare = usecase.indexOf('prepareOrRecover');
  if (assertion < 0 || prepare < 0 || assertion > prepare) {
    fail('the policy version is not asserted before the claim');
  }
}

/** 4 — strict XML parsing, and a window that cannot outlive the job. */
function checkParsingAndLifecycle(rootDir, fail) {
  const parser = code(read(rootDir, 'jsdomParser') ?? '');
  const purifier = code(read(rootDir, 'purifier') ?? '');

  if (!/contentType: SVG_CONTENT_TYPE/.test(parser) || !/'image\/svg\+xml'/.test(parser)) {
    fail('the parser does not select the strict XML content type');
  }
  for (const forbidden of ['runScripts', 'resources', 'cookieJar', 'virtualConsole', 'url:']) {
    if (parser.includes(forbidden)) fail(`the parser passes "${forbidden}" to jsdom`);
  }
  for (const [source, label] of [
    [parser, 'the parser'],
    [purifier, 'the sanitizer'],
  ]) {
    if (!/finally \{\s*[^}]*window\.close\(\)/.test(source)) {
      fail(`${label} does not close its window on every path`);
    }
    if (!/new JSDOM\(/.test(source)) fail(`${label} does not create its own window`);
  }
  // A window or a DOMPurify instance held at module scope would be shared
  // between jobs; both must be created inside the call.
  if (
    /^const \w+ = new JSDOM\(/m.test(purifier) ||
    /^const \w+ = createDOMPurify\(/m.test(purifier)
  ) {
    fail('the sanitizer shares a window or a DOMPurify instance across jobs');
  }
}

/** 5 — DOMPurify is configured to the APP3 policy, and never makes the decision. */
function checkSanitizerConfig(rootDir, fail) {
  const purifier = code(read(rootDir, 'purifier') ?? '');
  for (const [pattern, complaint] of [
    [/ALLOWED_TAGS: \[\.\.\.TEMPLATE_SVG_ELEMENTS\]/, 'the element allowlist'],
    [/ALLOWED_ATTR: \[\.\.\.TEMPLATE_SVG_ALL_ATTRIBUTES/, 'the attribute allowlist'],
    [/NAMESPACE: SVG_NAMESPACE/, 'the SVG namespace'],
    [/PARSER_MEDIA_TYPE: XML_MEDIA_TYPE/, 'XML parsing'],
    [/ALLOW_DATA_ATTR: false/, 'the data-attribute refusal'],
    [/ALLOW_ARIA_ATTR: false/, 'the ARIA-attribute refusal'],
    [/ALLOW_UNKNOWN_PROTOCOLS: false/, 'the unknown-protocol refusal'],
    [/allowCustomizedBuiltInElements: false/, 'the custom-element refusal'],
    [/ADD_URI_SAFE_ATTR: \[\]/, 'the empty URI-safe exception list'],
    [/ADD_DATA_URI_TAGS: \[\]/, 'the empty data-URI exception list'],
  ]) {
    if (!pattern.test(purifier)) fail(`the DOMPurify configuration is missing ${complaint}`);
  }
  if (/USE_PROFILES/.test(purifier)) {
    fail('the configuration relies on a DOMPurify profile instead of explicit lists');
  }
  // PO-02: `removed` is diagnostic only. A branch on it would make the library
  // the security decision, which the repository's own validation is.
  if (/\.removed/.test(purifier) || /\.removed/.test(code(read(rootDir, 'pipeline') ?? ''))) {
    fail('DOMPurify.removed is read as a decision; PO-02 makes it diagnostic only');
  }
}

/** 6 — reject on removal, and the fixed point that gives it meaning. */
function checkPipeline(rootDir, fail) {
  const pipeline = code(read(rootDir, 'pipeline') ?? '');

  if (!/canonicalDocumentsEqual\(validated, sanitized\)/.test(pipeline)) {
    fail('the pipeline does not compare the validated and sanitized structures');
  }
  // Both models must be built by the *same* builder at their own call sites; a
  // laxer second reading — or reusing the first model — would make the
  // comparison pass by construction. Counting occurrences is not enough: the
  // import statement is one, so a deleted call site still leaves two.
  for (const [pattern, complaint] of [
    [/withStrictSvgRoot\(source\.text, buildCanonicalSvgDocument\)/, 'validated'],
    [/withSanitizedSvgRoot\(source\.text, buildCanonicalSvgDocument\)/, 'sanitized'],
  ]) {
    if (!pattern.test(pipeline)) {
      fail(`the ${complaint} structure is not rebuilt with the same builder`);
    }
  }

  if (!/const second = runPass\(first\.bytes\)/.test(pipeline)) {
    fail('the pipeline does not re-run itself on its own canonical output');
  }
  if (!/!first\.bytes\.equals\(second\.bytes\)/.test(pipeline)) {
    fail('the pipeline does not require the two serializations to be identical');
  }
  for (const optimizer of ['svgo', 'optimize(', 'sharp(']) {
    if (pipeline.includes(optimizer)) fail(`"${optimizer}" runs inside the pipeline`);
  }
}

export function checkApp3W01B(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkFilesExist(rootDir, fail);
  checkDependencies(rootDir, fail);
  checkPolicyBinding(rootDir, fail);
  checkParsingAndLifecycle(rootDir, fail);
  checkSanitizerConfig(rootDir, fail);
  checkPipeline(rootDir, fail);

  for (const violation of checkApp3W01bGrammar(rootDir)) fail(violation);
  for (const violation of checkApp3W01bBoundaries(rootDir)) fail(violation);

  return failures;
}

async function main() {
  const failures = checkApp3W01B(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-w01b — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-w01b — the Template SVG consumer implements IMP-D047: dompurify 3.4.13 and ' +
      'jsdom 29.1.1 pinned exactly, with jsdom’s engines admitting the image’s Node and every ' +
      'refused alternative absent; the sanitization policy version *is* the event policy version ' +
      'and an unsupported one is refused before the claim; strict XML parsing with no script, ' +
      'resource, base URL or shared window, and a window closed on every path; nine elements, a ' +
      'closed attribute set and a validator per value with rejection as the default; a ' +
      'package-owned path parser with real arity, moveto continuation and single-character arc ' +
      'flags; the four ceilings enforced and nothing truncated; DOMPurify configured explicitly ' +
      'with removed read as diagnosis only; the structure rebuilt by the same builder and ' +
      'compared, then the whole pipeline re-run on its own output and required to match byte for ' +
      'byte; a canonical serializer with sorted attributes, no declaration, no BOM and no ' +
      'newline; the W01A key, claim, quartet and cleanup reused unchanged; and no event, ' +
      'producer, HTTP operation, OpenAPI schema, migration, derivative kind, public route or ' +
      'root script added',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
