#!/usr/bin/env node
/**
 * Repository file-size gate (D-032, CLAUDE.md §6).
 *
 * Hard limits:   source 400 lines, tests 600 lines  → non-zero exit code.
 * Review limits: source 300 lines, tests 500 lines  → warning only.
 *
 * Usage: node tools/check-file-size.mjs [rootDir]
 * The optional rootDir argument exists so the checker itself is testable.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

export const LIMITS = {
  sourceHard: 400,
  sourceReview: 300,
  testHard: 600,
  testReview: 500,
};

const SCANNED_DIRECTORIES = ['apps', 'packages', 'tools'];
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  'dist',
  'out',
  'coverage',
  '.turbo',
  '__snapshots__',
  'migrations',
  'fixtures',
]);

// Generated files and explicitly configured pure-data files.
const EXCLUDED_FILES = new Set(['next-env.d.ts', 'pnpm-lock.yaml']);
const EXCLUDED_SUFFIXES = ['.d.ts', '.snap', '.generated.ts', '.generated.tsx'];

const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_DIRECTORY_SEGMENTS = new Set(['tests', '__tests__', 'test']);

export function isTestFile(relativePath) {
  const segments = relativePath.split(/[\\/]/);
  const fileName = segments[segments.length - 1];
  if (TEST_FILE_PATTERN.test(fileName)) {
    return true;
  }
  return segments.slice(0, -1).some((segment) => TEST_DIRECTORY_SEGMENTS.has(segment));
}

function isScannedFile(fileName) {
  if (EXCLUDED_FILES.has(fileName)) {
    return false;
  }
  if (EXCLUDED_SUFFIXES.some((suffix) => fileName.endsWith(suffix))) {
    return false;
  }
  return SCANNED_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        yield* walk(fullPath);
      }
    } else if (entry.isFile() && isScannedFile(entry.name)) {
      yield fullPath;
    }
  }
}

function countLines(filePath) {
  const content = readFileSync(filePath, 'utf8');
  if (content === '') {
    return 0;
  }
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

/**
 * Scans the repository and returns { violations, warnings }, where each entry
 * is { path, lines, limit, kind }.
 */
export function checkFileSizes(rootDir) {
  const violations = [];
  const warnings = [];

  for (const directory of SCANNED_DIRECTORIES) {
    const scannedRoot = join(rootDir, directory);
    let rootStat;
    try {
      rootStat = statSync(scannedRoot);
    } catch {
      continue;
    }
    if (!rootStat.isDirectory()) {
      continue;
    }

    for (const filePath of walk(scannedRoot)) {
      const relativePath = relative(rootDir, filePath).split(sep).join('/');
      const lines = countLines(filePath);
      const test = isTestFile(relativePath);
      const kind = test ? 'test' : 'source';
      const hardLimit = test ? LIMITS.testHard : LIMITS.sourceHard;
      const reviewLimit = test ? LIMITS.testReview : LIMITS.sourceReview;

      if (lines > hardLimit) {
        violations.push({ path: relativePath, lines, limit: hardLimit, kind });
      } else if (lines > reviewLimit) {
        warnings.push({ path: relativePath, lines, limit: reviewLimit, kind });
      }
    }
  }

  return { violations, warnings };
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const { violations, warnings } = checkFileSizes(rootDir);

  for (const warning of warnings) {
    console.warn(
      `REVIEW  ${warning.path}: ${warning.lines} lines exceeds the ${warning.kind} review threshold of ${warning.limit}.`,
    );
  }
  for (const violation of violations) {
    console.error(
      `FAIL    ${violation.path}: ${violation.lines} lines exceeds the ${violation.kind} hard limit of ${violation.limit}.`,
    );
  }

  if (violations.length > 0) {
    console.error(`File-size check failed: ${violations.length} hard-limit violation(s).`);
    process.exitCode = 1;
  } else {
    console.log(`File-size check passed (${warnings.length} file(s) above the review threshold).`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join('/'))) {
  main();
}
