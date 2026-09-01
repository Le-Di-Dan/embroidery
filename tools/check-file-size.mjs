#!/usr/bin/env node
/**
 * Repository file-size gate (D-032, CLAUDE.md §6).
 *
 * Hard limits:   source 400 lines, tests 600 lines  → non-zero exit code.
 * Review limits: source 300 lines, tests 500 lines  → warning only.
 *
 * Two modes, and the difference between them is the whole point:
 *
 *   node tools/check-file-size.mjs [rootDir]
 *     Repository-wide sweep. Unchanged, and deliberately so. It carries the
 *     historical debt of the whole tree, so it cannot pass today and must not
 *     be used to gate an unrelated checkpoint.
 *
 *   node tools/check-file-size.mjs --paths <path> [path...]
 *     Scoped mode (`APP12-G01`). Measures exactly the files a change owns —
 *     directories recurse, and a missing path is an error rather than a silent
 *     skip. This is the mode a checkpoint runs, because CLAUDE.md §6 binds the
 *     files a change touches, not the ones it inherited.
 *
 * Scoped mode additionally measures `.scss`, which the repository-wide sweep
 * does not and still will not: CLAUDE.md §6 makes a stylesheet a logic/source
 * file, but teaching the *default* scan to read one would start failing on
 * historical debt no current change introduced (`design-studio.scss` alone is
 * 1876 lines). Scoped mode never sweeps the tree, so it inherits nothing and
 * the same limit applies safely. `tools/check-scss-file-size.mjs` remains the
 * SCSS-only gate and is unchanged.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

export const LIMITS = {
  sourceHard: 400,
  sourceReview: 300,
  testHard: 600,
  testReview: 500,
};

const SCANNED_DIRECTORIES = ['apps', 'packages', 'tools', 'spikes'];
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Scoped mode only. A stylesheet is a logic/source file under CLAUDE.md §6; it
 * is absent from the repository-wide sweep for the historical-debt reason above.
 */
const SCOPED_EXTENSIONS = [...SCANNED_EXTENSIONS, '.scss'];

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
  // Orval's output (`packages/api-client/src/generated`). It is regenerated
  // from the OpenAPI artifact and guarded by a tree-hash drift gate, so it is
  // never hand-edited and cannot be split by responsibility — the same reason
  // `migrations` and `__snapshots__` are excluded (CLAUDE.md §6).
  'generated',
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

function isScannedFile(fileName, extensions = SCANNED_EXTENSIONS) {
  if (EXCLUDED_FILES.has(fileName)) {
    return false;
  }
  if (EXCLUDED_SUFFIXES.some((suffix) => fileName.endsWith(suffix))) {
    return false;
  }
  return extensions.some((extension) => fileName.endsWith(extension));
}

function* walk(directory, extensions = SCANNED_EXTENSIONS) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        yield* walk(fullPath, extensions);
      }
    } else if (entry.isFile() && isScannedFile(entry.name, extensions)) {
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
 * Classifies one measured file, or `undefined` when it is within both limits.
 * Both modes go through here, so the two can never drift on a limit.
 */
function classify(relativePath, lines) {
  const test = isTestFile(relativePath);
  const kind = test ? 'test' : 'source';
  const hardLimit = test ? LIMITS.testHard : LIMITS.sourceHard;
  const reviewLimit = test ? LIMITS.testReview : LIMITS.sourceReview;

  if (lines > hardLimit) {
    return { severity: 'violation', entry: { path: relativePath, lines, limit: hardLimit, kind } };
  }
  if (lines > reviewLimit) {
    return { severity: 'warning', entry: { path: relativePath, lines, limit: reviewLimit, kind } };
  }
  return undefined;
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
      const result = classify(relativePath, countLines(filePath));
      if (result?.severity === 'violation') {
        violations.push(result.entry);
      } else if (result?.severity === 'warning') {
        warnings.push(result.entry);
      }
    }
  }

  return { violations, warnings };
}

export const SCOPED_FLAG = '--paths';

export function usage() {
  return [
    'Usage: node tools/check-file-size.mjs [rootDir]',
    `       node tools/check-file-size.mjs ${SCOPED_FLAG} <path> [path...]`,
    '',
    `With ${SCOPED_FLAG}, checks exactly the given files — and every source file`,
    'under the given directories, including .scss — against the CLAUDE.md §6',
    `limits (${LIMITS.sourceHard} source, ${LIMITS.testHard} test). A path that does not exist is an`,
    'error. Without it, sweeps the whole repository, which carries historical',
    'debt and is not a checkpoint gate.',
  ].join('\n');
}

/**
 * Expands the given paths to the files to measure. A directory recurses; a
 * file is taken only when it is a scanned source or test extension, so a caller
 * may pass a changed-file list unfiltered. A path that does not exist is
 * reported — a gate that quietly passes on a typo'd path is worse than no gate.
 */
export function collectScopedFiles(inputPaths, cwd = process.cwd()) {
  const files = [];
  const missing = [];
  for (const inputPath of inputPaths) {
    const fullPath = resolve(cwd, inputPath);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      missing.push(inputPath);
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...walk(fullPath, SCOPED_EXTENSIONS));
    } else if (isScannedFile(fullPath.split(sep).pop() ?? '', SCOPED_EXTENSIONS)) {
      files.push(fullPath);
    }
    // A supplied non-source file is ignored by design, not reported.
  }
  return { files: [...new Set(files)].sort(), missing };
}

/**
 * Scoped mode. Returns { checked, violations, warnings, missing } for exactly
 * the paths given — never for the tree around them.
 */
export function checkScopedFileSizes(inputPaths, cwd = process.cwd()) {
  const { files, missing } = collectScopedFiles(inputPaths, cwd);
  const violations = [];
  const warnings = [];

  for (const filePath of files) {
    const relativePath = relative(cwd, filePath).split(sep).join('/');
    const result = classify(relativePath, countLines(filePath));
    if (result?.severity === 'violation') {
      violations.push(result.entry);
    } else if (result?.severity === 'warning') {
      warnings.push(result.entry);
    }
  }

  return { checked: files.length, violations, warnings, missing };
}

function report(violations, warnings) {
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
}

function runScoped(inputPaths) {
  if (inputPaths.length === 0) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const { checked, violations, warnings, missing } = checkScopedFileSizes(inputPaths);
  report(violations, warnings);
  for (const missingPath of missing) {
    console.error(`FAIL    ${missingPath}: path does not exist.`);
  }

  if (violations.length > 0 || missing.length > 0) {
    console.error(
      `Scoped file-size check failed: ${violations.length} over-limit, ${missing.length} missing path(s).`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Scoped file-size check passed (${checked} file(s), ${warnings.length} above the review threshold).`,
  );
}

function main() {
  if (process.argv[2] === SCOPED_FLAG) {
    runScoped(process.argv.slice(3));
    return;
  }

  const rootDir = process.argv[2] ?? process.cwd();
  const { violations, warnings } = checkFileSizes(rootDir);
  report(violations, warnings);

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
