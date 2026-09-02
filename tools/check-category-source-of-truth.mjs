#!/usr/bin/env node
/**
 * The category source-of-truth gate (`APP12-C01-C1`).
 *
 * ```text
 * CATEGORY_VALUE_SOURCE_OF_TRUTH = DATABASE
 * ```
 *
 * Code owns the *shape* of a category — the slug syntax, the status vocabulary,
 * the visibility rules, the API contract, the sort rule. The `categories` table
 * owns the *values*: which categories exist, what they are called, what order
 * they appear in. This gate fails the build when a category **value** reappears
 * in production runtime source.
 *
 * ## Why it exists
 *
 * `APP12-C01` made the OpenAPI contract dynamic but left the four historical
 * slugs compiled into both applications behind "legacy" shims. The result looked
 * dynamic and was not: Discover showed four chips, the Admin offered four
 * options, the sitemap advertised four URLs, and a real fifth category rendered
 * as `Chưa xác định`. `APP12-C01-C1` removed all of it. This gate is what stops
 * it coming back one convenience constant at a time.
 *
 * ## What it checks, and how
 *
 * Structural checks first, because a grep alone is both too eager and too blind:
 *
 * 1. **Banned imports.** Production source may not import the historical fixture
 *    or any module whose name marks it as a legacy category list.
 * 2. **Banned symbols.** The runtime value-set symbols may not be referenced.
 * 3. **Category-value literals.** A production file may not contain a
 *    *collection* of historical category slugs or their Vietnamese labels — the
 *    array, object-map or switch shapes a compiled taxonomy actually takes.
 *
 * A single slug in a doc comment, an OpenAPI `example`, or a URL in a
 * description is not a taxonomy and does not fail: the literal rule needs
 * **two or more** distinct historical values in one file, which is what
 * distinguishes an illustration from a list.
 *
 * ## What it deliberately does not scan
 *
 * Historical migrations, the `__historical__` test fixture, every test file,
 * documentation, reports, Figma copy and the APP2-era smoke scripts. Those are
 * allowed to name the four categories: they are recording what happened, not
 * deciding what is. Failing them would be the gate mistaking history for
 * authority — the same category error it exists to prevent.
 *
 * Usage: `node tools/check-category-source-of-truth.mjs`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The production runtime trees.
 *
 * `src` only. A package's `test/` tree, its specs and its historical fixtures
 * are not runtime, and `dist` is build output.
 *
 * ## Every production root, not only the ones a category lives in today
 * (`APP12-C03`)
 *
 * `APP12-C01-C1` scanned the eight trees that then held category code. That is
 * the wrong boundary for a gate: it fails only where a taxonomy already existed,
 * and a compiled category list added to an unscanned package would pass. So the
 * list is now every workspace that ships runtime code — the four applications
 * and every publishable package — regardless of whether it mentions a category
 * today.
 *
 * The workspaces deliberately absent are the ones that are not production
 * runtime at all: `test-utils`, `frontend-testing` and `e2e-testing` exist to
 * hold fixtures, and `eslint-config`, `prettier-config`, `typescript-config` and
 * `styles` ship no TypeScript. Scanning a fixture tree would be the gate
 * mistaking test data for authority — the same category error §25 forbids.
 */
export const SCANNED_ROOTS = Object.freeze([
  join('apps', 'api', 'src'),
  join('apps', 'admin', 'src'),
  join('apps', 'storefront', 'src'),
  join('apps', 'worker', 'src'),
  join('packages', 'api-client', 'src'),
  join('packages', 'contracts', 'src'),
  join('packages', 'database', 'src'),
  join('packages', 'persistence', 'src'),
  join('packages', 'design-document', 'src'),
  join('packages', 'design-engine', 'src'),
  join('packages', 'domain-types', 'src'),
  join('packages', 'notification-delivery', 'src'),
  join('packages', 'object-storage', 'src'),
  join('packages', 'observability', 'src'),
  join('packages', 'ui', 'src'),
  join('packages', 'validation', 'src'),
]);

/** Extensions that can carry runtime code. */
const SOURCE_EXTENSIONS = Object.freeze(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs']);

/** Directory names that are never production runtime, wherever they appear. */
const EXCLUDED_DIRECTORIES = Object.freeze([
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'generated',
  '__historical__',
  '__tests__',
  '__mocks__',
  'test',
  'tests',
]);

/** File suffixes that mark a file as test rather than runtime. */
const TEST_SUFFIXES = Object.freeze([
  '.spec.ts',
  '.spec.tsx',
  '.test.ts',
  '.test.tsx',
  '.integration.spec.ts',
  '.d.ts',
]);

/**
 * Imports a production file may not make.
 *
 * Import-based rather than word-based: this is the check that actually matters,
 * because a value only becomes authority when something reads it.
 */
export const BANNED_IMPORT_FRAGMENTS = Object.freeze([
  'legacy-category-slugs',
  // Any module under a `__historical__` directory: those hold records of what a
  // migration once did, and production must never read one. Matching the
  // directory rather than the file name means a second historical fixture is
  // caught the day it is added.
  '__historical__/',
  'app2-category-fixture',
]);

/** Symbols that were, or would be, a compiled category value set. */
export const BANNED_SYMBOLS = Object.freeze([
  'APP2_CATEGORY_SLUGS',
  'APP2_CATEGORY_TAXONOMY',
  'APP2_HISTORICAL_CATEGORIES',
  'APP2_HISTORICAL_CATEGORY_SLUGS',
  'LEGACY_CATEGORY_SLUGS',
  'LegacyCategorySlug',
  'DISCOVER_CATEGORY_SLUGS',
  'PRODUCT_CATEGORY_SLUGS',
  'PRODUCT_CATEGORY_OPTIONS',
  'PRODUCT_CATEGORY_FILTER_OPTIONS',
  'App2CategorySlug',
]);

/**
 * The historical category values, as *evidence of a list* rather than as a
 * taxonomy this file endorses.
 *
 * They are here so the gate can recognise the shape of the thing it forbids.
 * Two or more in one production file is a compiled taxonomy; one is an example.
 */
const HISTORICAL_SLUGS = Object.freeze(['thu-bong', 'khan', 'quan-ao', 'khac']);
const HISTORICAL_LABELS = Object.freeze(['Thú bông', 'Khăn', 'Quần áo', 'Khác']);

/** How many distinct historical values in one production file constitute a list. */
export const LIST_THRESHOLD = 2;

function isExcludedPath(relativePath) {
  const segments = relativePath.split(sep);
  return segments.some((segment) => EXCLUDED_DIRECTORIES.includes(segment));
}

function isTestFile(name) {
  return TEST_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/** Every production source file under `root`, recursively. */
export function collectSourceFiles(root, base = root, out = []) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.includes(entry.name)) continue;
      collectSourceFiles(full, base, out);
      continue;
    }
    if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
    if (isTestFile(entry.name)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Strips block and line comments.
 *
 * A comment explaining *why* the four categories are no longer compiled in must
 * not itself trip the gate — the whole correction is documented in prose that
 * names them. Only code is measured.
 */
export function withoutComments(source) {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/** Quoted string literals in `code`, unquoted. */
function stringLiterals(code) {
  const matches = code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g);
  return [...matches].map((match) => match[1] ?? match[2] ?? match[3] ?? '');
}

/** Every violation in one production file. */
export function inspectFile(relativePath, source) {
  const violations = [];
  const code = withoutComments(source);

  for (const fragment of BANNED_IMPORT_FRAGMENTS) {
    if (new RegExp(`(from|import|require)\\s*\\(?\\s*['"\`][^'"\`]*${fragment}`).test(code)) {
      violations.push(
        `${relativePath}: imports \`${fragment}\` — historical category values are test-only data, ` +
          `never runtime authority`,
      );
    }
  }

  for (const symbol of BANNED_SYMBOLS) {
    if (new RegExp(`\\b${symbol}\\b`).test(code)) {
      violations.push(
        `${relativePath}: references \`${symbol}\` — a compiled category value set. ` +
          `Read \`GET /api/public/categories\` instead.`,
      );
    }
  }

  // Literals only: a slug reaching a WHERE clause or a chip label is what
  // matters, and both arrive as strings.
  const literals = new Set(stringLiterals(code));
  const slugs = HISTORICAL_SLUGS.filter((slug) => literals.has(slug));
  const labels = HISTORICAL_LABELS.filter((label) => literals.has(label));

  if (slugs.length >= LIST_THRESHOLD) {
    violations.push(
      `${relativePath}: carries ${slugs.length} historical category slugs (${slugs.join(', ')}) — ` +
        `that is a compiled taxonomy, and the \`categories\` table is the only one`,
    );
  }
  if (labels.length >= LIST_THRESHOLD) {
    violations.push(
      `${relativePath}: carries ${labels.length} historical category labels ` +
        `(${labels.join(', ')}) — a category's name is data, read from its row`,
    );
  }

  return violations;
}

export function checkCategorySourceOfTruth(root = REPO_ROOT) {
  const failures = [];
  let scanned = 0;

  for (const relativeRoot of SCANNED_ROOTS) {
    const absolute = join(root, relativeRoot);
    try {
      if (!statSync(absolute).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const file of collectSourceFiles(absolute)) {
      const relativePath = relative(root, file).split(sep).join('/');
      if (isExcludedPath(relative(root, file))) continue;
      scanned += 1;
      failures.push(...inspectFile(relativePath, readFileSync(file, 'utf8')));
    }
  }

  return { failures, scanned };
}

function main() {
  const { failures, scanned } = checkCategorySourceOfTruth();

  if (failures.length > 0) {
    console.error('check:category-source-of-truth — production source carries category values\n');
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    console.error(
      `\ncheck:category-source-of-truth — ${failures.length} failure(s) across ${scanned} file(s).\n` +
        'CATEGORY_VALUE_SOURCE_OF_TRUTH = DATABASE (APP12-C01-C1, IMP-D062): code defines the\n' +
        'slug shape, the status vocabulary and the visibility rules; the `categories` table\n' +
        'defines which categories exist and what they are called.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `check:category-source-of-truth — ${scanned} production source file(s) scanned; ` +
      'no compiled category values, no legacy taxonomy imports, no slug-to-label maps.',
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}`
) {
  main();
} else if (process.argv[1]?.endsWith('check-category-source-of-truth.mjs')) {
  main();
}
