#!/usr/bin/env node
/**
 * Scoped SCSS source-size gate (`FU-APP11-A02-C1-01`, built at `APP11-S01`).
 *
 * Usage: node tools/check-scss-file-size.mjs <path> [path...]
 *
 * `tools/check-file-size.mjs` scans `.ts/.tsx/.js/.jsx/.mjs/.cjs` only, so the
 * CLAUDE.md §6 400-line limit has never been enforced on a stylesheet —
 * `APP11-A02-C1` found this the hard way. SCSS is runtime source and the limit
 * applies to it.
 *
 * This is a **separate, explicitly scoped** tool rather than a new extension on
 * the repository-wide checker, and that is the deliberate part. Teaching the
 * default scan to read `.scss` would make it start failing on historical debt
 * that no current change introduced (`design-studio.scss` alone is 1876 lines),
 * turning an unrelated checkpoint into a stylesheet-refactor project. The
 * default behaviour of `check-file-size.mjs` is therefore untouched.
 *
 * Consequently this tool has **no repository-wide mode**. It scans exactly the
 * paths it is given — the stylesheets a change actually owns — and with no
 * arguments it prints usage and exits non-zero rather than defaulting to a
 * global sweep.
 *
 * Indexed as `CMD-CHECK-SCSS-FILE-SIZE` in
 * `docs/implementation/SCOPED_COMMAND_INDEX.md`; not a global control.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** CLAUDE.md §6: stylesheets are logic/source files. */
export const SCSS_LIMITS = { hard: 400, review: 300 };

const SCSS_EXTENSION = '.scss';
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  'dist',
  'out',
  'coverage',
  '.turbo',
]);

export function usage() {
  return [
    'Usage: node tools/check-scss-file-size.mjs <path> [path...]',
    '',
    'Checks the given .scss files, and every .scss file under the given',
    `directories, against the ${SCSS_LIMITS.hard}-line hard limit.`,
    'There is no repository-wide mode: pass the paths your change owns.',
  ].join('\n');
}

function* walkScss(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) yield* walkScss(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(SCSS_EXTENSION)) {
      yield fullPath;
    }
  }
}

/**
 * Expands the given paths to the set of stylesheets to measure.
 *
 * A directory is walked recursively; a file is taken only when it is `.scss`,
 * so a caller may pass a mixed changed-file list unfiltered. A path that does
 * not exist is an error, not a silent skip — a gate that quietly passes on a
 * typo'd path is worse than no gate.
 */
export function collectScssFiles(inputPaths, cwd = process.cwd()) {
  const files = [];
  const missing = [];
  for (const inputPath of inputPaths) {
    const fullPath = path.resolve(cwd, inputPath);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      missing.push(inputPath);
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...walkScss(fullPath));
    } else if (fullPath.endsWith(SCSS_EXTENSION)) {
      files.push(fullPath);
    }
    // A supplied non-SCSS file is ignored by design, not reported.
  }
  return { files: [...new Set(files)].sort(), missing };
}

function countLines(filePath) {
  const content = readFileSync(filePath, 'utf8');
  if (content === '') return 0;
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

/** Returns `{ checked, violations, warnings, missing }` for the given paths. */
export function checkScssFileSizes(inputPaths, cwd = process.cwd()) {
  const { files, missing } = collectScssFiles(inputPaths, cwd);
  const violations = [];
  const warnings = [];

  for (const filePath of files) {
    const lines = countLines(filePath);
    const relativePath = path.relative(cwd, filePath).split(path.sep).join('/');
    if (lines > SCSS_LIMITS.hard) {
      violations.push({ path: relativePath, lines, limit: SCSS_LIMITS.hard });
    } else if (lines > SCSS_LIMITS.review) {
      warnings.push({ path: relativePath, lines, limit: SCSS_LIMITS.review });
    }
  }

  return { checked: files.length, violations, warnings, missing };
}

function main() {
  const inputPaths = process.argv.slice(2);
  if (inputPaths.length === 0) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const { checked, violations, warnings, missing } = checkScssFileSizes(inputPaths);

  for (const warning of warnings) {
    console.warn(
      `REVIEW  ${warning.path}: ${warning.lines} lines exceeds the SCSS review threshold of ${warning.limit}.`,
    );
  }
  for (const violation of violations) {
    console.error(
      `FAIL    ${violation.path}: ${violation.lines} lines exceeds the SCSS hard limit of ${violation.limit}.`,
    );
  }
  for (const missingPath of missing) {
    console.error(`FAIL    ${missingPath}: path does not exist.`);
  }

  if (violations.length > 0 || missing.length > 0) {
    console.error(
      `SCSS file-size check failed: ${violations.length} over-limit, ${missing.length} missing path(s).`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `SCSS file-size check passed (${checked} stylesheet(s), ${warnings.length} above the review threshold).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
