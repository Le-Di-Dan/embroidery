#!/usr/bin/env node
// Static frontend test-boundary gate (APP0-T02A). Verifies, without a build:
//   1. no test files or test-support code live under an app's production `src/`;
//   2. no production `src/` file imports the test-only `@embroidery/frontend-testing`;
//   3. `@embroidery/frontend-testing` is a devDependency only (never a runtime dep).
// Cross-platform, dependency-free. Exit 1 on any violation.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APPS = ['apps/admin', 'apps/storefront'];
const TEST_PACKAGE = '@embroidery/frontend-testing';
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

for (const app of APPS) {
  const srcDir = join(ROOT, app, 'src');

  // (1) + (2) scan production src.
  for (const file of walk(srcDir)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (TEST_FILE.test(file)) {
      violations.push(`${rel}: test file under production src (move to ${app}/test/**)`);
    }
    if (/\.[cm]?[jt]sx?$/.test(file)) {
      const text = readFileSync(file, 'utf8');
      if (text.includes(TEST_PACKAGE)) {
        violations.push(`${rel}: production src imports ${TEST_PACKAGE} (test-only)`);
      }
    }
  }

  // (3) dependency-graph placement.
  const pkg = JSON.parse(readFileSync(join(ROOT, app, 'package.json'), 'utf8'));
  if (pkg.dependencies && Object.hasOwn(pkg.dependencies, TEST_PACKAGE)) {
    violations.push(
      `${app}/package.json: ${TEST_PACKAGE} must be a devDependency, not a runtime dependency`,
    );
  }
}

if (violations.length > 0) {
  console.error('[frontend-test-boundary] violations:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('[frontend-test-boundary] clean: no test code or test-only imports under app src.');
