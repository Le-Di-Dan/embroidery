#!/usr/bin/env node
/**
 * `APP3-P01` — the production Design Document foundation.
 *
 * This gate holds four boundaries a compiler cannot, each of which erodes in a
 * plausible-looking way:
 *
 * 1. **The runtime split.** Hashing is server-only because `crypto.subtle` is
 *    undefined outside a secure context (APP0-R01), and the failure mode is a
 *    re-export three files deep — so the gate walks the reachable module graph.
 * 2. **The geometry line.** `APP3-P02` owns bounds, rotation and px↔mm; the
 *    cheapest way to lose it is a "small" helper here that rotates a rectangle.
 * 3. **The font evidence.** The registry transcribes hashes from `APP3-F01`, so
 *    the gate re-hashes the committed binaries — a registry and a manifest can
 *    agree with each other and both be wrong about what is on disk.
 * 4. **The Asset pixel budget** (`APP3-P01-C1`) — see `checkAssetKeyedPixels`.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app3-p01.mjs [rootDir]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3Db01 } from './check-app3-db01.mjs';
import { checkApp3F01, FONT_DIR } from './check-app3-f01-font-assets.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE_DIR = 'packages/design-document';
export const SRC_DIR = `${PACKAGE_DIR}/src`;

/** Complexity values IMP-D044 PO-09 locked. No checkpoint may raise one quietly. */
export const G04_LIMITS = Object.freeze({
  maxCanonicalBytes: 524_288,
  maxElements: 100,
  maxImageElements: 20,
  maxTextElements: 80,
  maxUniqueAssets: 20,
  maxGroupDepth: 8,
  maxCharactersPerTextElement: 500,
  maxTotalTextCharacters: 5_000,
  maxDecodedPixels: 33_554_432,
});

/** The precision APP0-R01 executed. A different number is a new decision. */
export const QUANTIZATION_SCALE = 10_000;

export const ELEMENT_KINDS = Object.freeze(['text', 'image', 'shape', 'freehand', 'group']);

export const PHASE_FILE = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';

/** `|` stands in for a space so each list stays one readable line. */
const words = (list) => Object.freeze(list.split(' ').map((word) => word.replace('|', ' ')));

const FORBIDDEN_SPECIFIERS = words(
  'react next @nestjs konva fabric interact.js @embroidery/database ' +
    '@embroidery/persistence @embroidery/object-storage @embroidery/design-engine spikes/',
);

/** Trigonometry and unit conversion belong to `APP3-P02`. */
const GEOMETRY_TOKENS = words(
  'Math.cos Math.sin Math.atan Math.tan Math.hypot function|boundingBox ' +
    'function|pxToMm function|mmToPx isWithinArea',
);

function read(rootDir, relative) {
  const path = join(rootDir, relative);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Every `.ts` under the package source that `accept` selects. */
function sourceFiles(rootDir, accept, skipTesting = false) {
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
      // `testing/` holds fixtures; it is excluded from the published build.
      if (entry.isDirectory()) {
        if (!(skipTesting && entry.name === 'testing')) walk(full);
      } else if (extname(entry.name) === '.ts' && accept(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(join(rootDir, SRC_DIR));
  return found;
}

const productionFiles = (rootDir) =>
  sourceFiles(rootDir, (name) => !name.endsWith('.spec.ts'), true);

/** Modules a bundler would pull in when it imports `entry`. */
function reachableFrom(entry, seen = new Set()) {
  const candidates = entry.endsWith('.ts') ? [entry] : [`${entry}.ts`, join(entry, 'index.ts')];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (file === undefined || seen.has(file)) return seen;
  seen.add(file);
  for (const match of readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
    const specifier = match[1];
    if (specifier === undefined || !specifier.startsWith('.')) continue;
    reachableFrom(resolve(dirname(file), specifier), seen);
  }
  return seen;
}

/** 1, 15 — the package is implemented and carries its own tests. */
function checkPackagePresence(rootDir, fail) {
  const index = read(rootDir, `${SRC_DIR}/index.ts`);
  if (index === undefined) {
    fail(`${SRC_DIR}/index.ts is missing`);
    return false;
  }
  if (/export\s*\{\s*\}/.test(index)) {
    fail(`${SRC_DIR}/index.ts is still the empty stub — APP3-P01 is not implemented`);
    return false;
  }
  const specs = sourceFiles(rootDir, (name) => name.endsWith('.spec.ts'));
  if (specs.length < 5) {
    fail(`the package carries only ${String(specs.length)} test file(s); expected focused suites`);
  }

  const manifest = read(rootDir, `${PACKAGE_DIR}/package.json`);
  if (manifest === undefined || !/"test"\s*:/.test(manifest)) {
    fail(`${PACKAGE_DIR}/package.json declares no test script`);
  }
  if (manifest !== undefined && !/"build"\s*:/.test(manifest)) {
    fail(`${PACKAGE_DIR}/package.json declares no build script`);
  }
  return true;
}

/** 3, 4 — schema version 1 and exactly the five ruled element kinds. */
function checkSchema(rootDir, fail) {
  const constants = read(rootDir, `${SRC_DIR}/schema/constants.ts`) ?? '';
  if (!/CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION\s*=\s*1\b/.test(constants)) {
    fail('CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION must be exactly 1');
  }
  const elements = read(rootDir, `${SRC_DIR}/schema/elements.ts`) ?? '';
  for (const kind of ELEMENT_KINDS) {
    if (!elements.includes(`'${kind}'`)) fail(`the element union does not support "${kind}"`);
  }
  // `svg` is not a v1 element kind: sanitized SVG arrives as an Asset.
  if (/DesignElementType\s*=[^;]*'svg'/.test(elements)) {
    fail('"svg" is not a v1 element kind');
  }
  const document = read(rootDir, `${SRC_DIR}/schema/document.ts`) ?? '';
  for (const field of ['schemaVersion', 'placement', 'elements']) {
    if (!document.includes(field)) fail(`the document root does not declare "${field}"`);
  }
}

/** 7 — every complexity constant, at its exact ruled value. */
function checkComplexityConstants(rootDir, fail) {
  const constants = read(rootDir, `${SRC_DIR}/schema/constants.ts`) ?? '';
  const normalized = constants.replaceAll('_', '');
  for (const [name, value] of Object.entries(G04_LIMITS)) {
    if (!new RegExp(`${name}\\s*:\\s*${String(value)}\\b`).test(normalized)) {
      fail(`complexity constant ${name} is not exactly ${String(value)}`);
    }
  }
}

/** 8 — the quantization precision is the one accepted authority executed. */
function checkQuantization(rootDir, fail) {
  const source = read(rootDir, `${SRC_DIR}/quantization/quantize.ts`);
  if (source === undefined) {
    fail('the quantization pass is missing');
    return;
  }
  if (
    !new RegExp(
      `QUANTIZATION_SCALE\\s*=\\s*${String(QUANTIZATION_SCALE).replace('0000', '_?0_?000')}`,
    ).test(source)
  ) {
    fail(`the quantization scale is not ${String(QUANTIZATION_SCALE)}`);
  }
  for (const token of ['ADR-APP0-001', 'APP0-R01']) {
    if (!source.includes(token))
      fail(`the quantization source does not record ${token} as authority`);
  }
  // The header quotes the evidence verbatim, so only executable code counts.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (!/Object\.is\(rounded,\s*-0\)/.test(code)) {
    fail('quantization does not normalize negative zero');
  }
}

/**
 * 18 (`APP3-P01-C1`) — the decoded-pixel budget is keyed by Asset, not derivative.
 *
 * The two look equivalent only while every Asset is placed through a single
 * derivative. `IMP-D044` PO-09 keys **both** the 20-Asset limit and the pixel
 * total on the Asset, so derivative-keying overcharges any document reaching one
 * Asset through two derivatives — an ambiguity rejected, never resolved.
 */
function checkAssetKeyedPixels(rootDir, context, fail) {
  const phase = read(rootDir, PHASE_FILE) ?? '';
  const spec = read(rootDir, `${SRC_DIR}/validation/context.spec.ts`) ?? '';
  const c = context;
  if (!/countedAssets/.test(c)) fail('contextual validation does not budget pixels per Asset');
  if (/counted(Derivatives|ByDerivative)/.test(c)) fail('derivative-keyed accumulation remains');
  if (!/countedAssets\.get\(\s*record\.assetId\s*\)/.test(c))
    fail('the budget is not keyed by assetId');
  if (!/seen\.derivativeId\s*!==\s*record\.derivativeId/.test(c)) {
    fail('one Asset placed through two derivative ids is not detected');
  }
  // The rule this restores is G04's, so its wording must still be there.
  if (!phase.includes('ONCE_FOR_ASSET_BUDGETS_EACH_FOR_ELEMENTS')) {
    fail('the APP3-G04 repeated-asset counting ruling is no longer recorded');
  }
  if (!phase.includes('unique referenced image assets')) {
    fail('the G04 ruling no longer says "unique referenced image assets"');
  }
  if (!/two different derivative ids/.test(spec)) {
    fail('the package tests lack the one-Asset/two-derivatives regression');
  }
}

/** 9, 11 — the canonicalization, migration and contextual APIs exist. */
function checkApis(rootDir, fail) {
  const index = read(rootDir, `${SRC_DIR}/index.ts`) ?? '';
  for (const name of [
    'canonicalizeDesignDocument',
    'canonicalizeDesignDocumentToBytes',
    'migrateDesignDocument',
    'quantizeDesignDocument',
    'validateDesignDocumentStructure',
    'validateDesignDocumentComplexity',
    'validateDesignDocumentContext',
    'findControlledFont',
  ]) {
    if (!index.includes(name)) fail(`the package root does not export ${name}`);
  }

  const context = read(rootDir, `${SRC_DIR}/validation/context.ts`) ?? '';
  for (const token of ['ELIGIBLE_DERIVATIVE_KIND', 'ELIGIBLE_DERIVATIVE_STATUS']) {
    if (!context.includes(token)) fail(`contextual validation does not enforce ${token}`);
  }
  for (const column of ['widthPx', 'heightPx', 'mediaType', 'byteSize']) {
    if (!context.includes(column)) fail(`contextual validation ignores derivative ${column}`);
  }
  checkAssetKeyedPixels(rootDir, context, fail);
  const constants = read(rootDir, `${SRC_DIR}/schema/constants.ts`) ?? '';
  if (!constants.includes("'NORMALIZED'") || !constants.includes("'READY'")) {
    fail('the eligible derivative kind and status are not NORMALIZED / READY');
  }

  const migration = read(rootDir, `${SRC_DIR}/migration/registry.ts`) ?? '';
  if (!migration.includes('UNSUPPORTED_SCHEMA_VERSION')) {
    fail('the migration registry does not fail an unknown version loudly');
  }
}

/** 5, 6, 10 — the dependency boundary and the browser/server split. */
function checkBoundaries(rootDir, fail) {
  for (const file of productionFiles(rootDir)) {
    const source = readFileSync(file, 'utf8');
    const shown = file.slice(rootDir.length + 1);
    for (const specifier of FORBIDDEN_SPECIFIERS) {
      if (source.toLowerCase().includes(`from '${specifier}`)) {
        fail(`${shown} imports the forbidden module "${specifier}"`);
      }
    }
  }

  const root = join(rootDir, SRC_DIR, 'index.ts');
  const serverEntry = join(rootDir, SRC_DIR, 'server', 'index.ts');
  if (!existsSync(serverEntry)) {
    fail(`${SRC_DIR}/server/index.ts is missing — hashing has no server-only home`);
    return;
  }
  const reachable = [...reachableFrom(root)];
  if (reachable.length < 5) fail('the root export graph could not be walked');
  for (const file of reachable) {
    if (/from\s+'node:/.test(readFileSync(file, 'utf8'))) {
      fail(`${file.slice(rootDir.length + 1)} is reachable from the root export and imports node:`);
    }
  }
  if (reachable.includes(serverEntry))
    fail('the browser-safe root export reaches the server module');
  const rootSource = readFileSync(root, 'utf8');
  for (const token of ['hashDesignDocumentSha256', 'createHash']) {
    if (rootSource.includes(token))
      fail(`the root export exposes ${token}; hashing is server-only`);
  }
  const manifest = read(rootDir, `${PACKAGE_DIR}/package.json`) ?? '';
  if (!manifest.includes('"./server"')) {
    fail(`${PACKAGE_DIR}/package.json declares no "./server" export subpath`);
  }
}

/** 14, 17 — geometry, APIs, persistence, workers and UI stayed out. */
function checkScope(rootDir, fail) {
  for (const file of productionFiles(rootDir)) {
    const source = readFileSync(file, 'utf8');
    const shown = file.slice(rootDir.length + 1);
    for (const token of GEOMETRY_TOKENS) {
      if (source.includes(token)) fail(`${shown} contains geometry (${token}) owned by APP3-P02`);
    }
    if (/[*/]\s*\w*pxPerMm|pxPerMm\s*[*/]/.test(source)) {
      fail(`${shown} converts between pixels and millimetres, which is APP3-P02`);
    }
    for (const token of ['@Controller', '@Injectable', '@Module', 'useState(', 'jsx']) {
      if (source.includes(token)) fail(`${shown} contains ${token}; P01 delivers no API or UI`);
    }
  }
}

/** 12, 13 — the registry names exactly the committed F01 assets. */
function checkFontRegistry(rootDir, fail) {
  const registry = read(rootDir, `${SRC_DIR}/fonts/registry.ts`);
  if (registry === undefined) {
    fail('the controlled font registry is missing');
    return;
  }
  const required = ["fontId: 'inter'", "family: 'Inter'", "licenseSpdx: 'OFL-1.1'"];
  required.push("upstreamTag: 'v4.1'", 'e3a3d4c57d5ecc01453a575621882a384c1995a3');
  required.push("vietnameseCoverage: 'VERIFIED_COMPLETE'", 'VIETNAMESE-COVERAGE.json');
  required.push("fallbackPolicy: 'REJECT_IF_CONTROLLED_FONT_UNAVAILABLE'", 'LICENSE.txt');
  required.push('FONT-PROVENANCE.json');
  for (const token of required) {
    if (!registry.includes(token)) fail(`the font registry does not record ${token}`);
  }
  // Comments legitimately explain why General Sans is absent, so only code counts.
  const code = registry.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const forbidden of ['General Sans', 'http://', 'https://', 'base64']) {
    if (code.includes(forbidden)) fail(`the font registry references "${forbidden}"`);
  }

  // A registry and a manifest can agree and both be wrong about the file.
  const digits = registry.replaceAll('_', '');
  for (const name of ['InterVariable.woff2', 'InterVariable-Italic.woff2']) {
    const path = join(rootDir, FONT_DIR, name);
    if (!existsSync(path)) {
      fail(`${FONT_DIR}/${name} is missing`);
      continue;
    }
    const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (!registry.includes(digest)) {
      fail(`the font registry does not carry the committed SHA-256 of ${name}`);
    }
    if (!digits.includes(String(statSync(path).size))) {
      fail(`the font registry does not carry the committed byte size of ${name}`);
    }
  }
}

/** 16 — the accepted authority this checkpoint was resumed on is intact. */
function checkEntryAuthority(rootDir, fail) {
  for (const violation of checkApp3F01(rootDir)) fail(`APP3-F01 regression: ${violation}`);
  for (const violation of checkApp3Db01(rootDir)) fail(`APP3-DB01 regression: ${violation}`);
}

export function checkApp3P01(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  if (checkPackagePresence(rootDir, fail)) {
    checkSchema(rootDir, fail);
    checkComplexityConstants(rootDir, fail);
    checkQuantization(rootDir, fail);
    checkApis(rootDir, fail);
    checkBoundaries(rootDir, fail);
    checkScope(rootDir, fail);
    checkFontRegistry(rootDir, fail);
  }
  checkEntryAuthority(rootDir, fail);
  return failures;
}

async function main() {
  const failures = checkApp3P01(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-p01 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-p01 — schema v1 with five element kinds, the nine G04 complexity constants at ' +
      'their exact ruled values, quantization at the APP0-R01 scale of 10,000 with negative zero ' +
      'normalized, RFC 8785 canonicalization and an ordered migration registry that fails an ' +
      'unknown version loudly, contextual validation that demands READY NORMALIZED derivative ' +
      'metadata and budgets decoded pixels per Asset (rejecting one Asset placed through two ' +
      'derivatives), and a controlled Inter registry whose hashes match the committed APP3-F01 ' +
      'binaries; hashing is reachable only through the server subpath, no Node built-in is ' +
      'reachable from the browser-safe root, and no geometry, API, worker or UI entered P01',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
