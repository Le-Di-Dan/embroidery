/**
 * Verification for tools/check-file-size.mjs using node:test (no extra
 * dependencies). Run from the repository root:  node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  checkFileSizes,
  checkScopedFileSizes,
  isTestFile,
  LIMITS,
  usage,
} from './check-file-size.mjs';

function makeFile(root, relativePath, lines) {
  const fullPath = join(root, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, Array.from({ length: lines }, (_, i) => `// line ${i + 1}`).join('\n'));
}

function withFixtureRepo(callback) {
  const root = mkdtempSync(join(tmpdir(), 'file-size-check-'));
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('passes when all files are within limits', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'apps/api/src/small.ts', 50);
    makeFile(root, 'packages/contracts/src/small.test.ts', 450);
    const { violations, warnings } = checkFileSizes(root);
    assert.equal(violations.length, 0);
    assert.equal(warnings.length, 0);
  });
});

test('fails a source file above the 400-line hard limit', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'apps/api/src/huge.ts', LIMITS.sourceHard + 1);
    const { violations } = checkFileSizes(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].path, 'apps/api/src/huge.ts');
    assert.equal(violations[0].lines, 401);
    assert.equal(violations[0].limit, LIMITS.sourceHard);
    assert.equal(violations[0].kind, 'source');
  });
});

test('applies the higher 600-line hard limit to test files', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'apps/api/src/big.spec.ts', LIMITS.testHard); // exactly at limit: ok
    makeFile(root, 'apps/api/src/too-big.spec.ts', LIMITS.testHard + 1);
    const { violations } = checkFileSizes(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].path, 'apps/api/src/too-big.spec.ts');
    assert.equal(violations[0].kind, 'test');
  });
});

test('reports review-threshold warnings without failing', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'apps/api/src/borderline.ts', LIMITS.sourceReview + 1);
    makeFile(root, 'apps/api/src/borderline.spec.ts', LIMITS.testReview + 1);
    const { violations, warnings } = checkFileSizes(root);
    assert.equal(violations.length, 0);
    assert.equal(warnings.length, 2);
  });
});

test('excludes generated output, dependencies and declaration files', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'apps/web/node_modules/lib/huge.ts', 5000);
    makeFile(root, 'apps/web/.next/huge.js', 5000);
    makeFile(root, 'apps/api/dist/huge.js', 5000);
    makeFile(root, 'apps/api/coverage/huge.js', 5000);
    makeFile(root, 'apps/web/next-env.d.ts', 5000);
    makeFile(root, 'packages/contracts/src/huge.d.ts', 5000);
    makeFile(root, 'apps/api/src/modules/x/migrations/huge.ts', 5000);
    const { violations, warnings } = checkFileSizes(root);
    assert.equal(violations.length, 0);
    assert.equal(warnings.length, 0);
  });
});

test('classifies files in tests directories as test files', () => {
  assert.equal(isTestFile('apps/storefront/src/tests/smoke/home.tsx'), true);
  assert.equal(isTestFile('apps/api/src/modules/health/health.controller.spec.ts'), true);
  assert.equal(isTestFile('packages/contracts/src/api-envelope/guards.test.ts'), true);
  assert.equal(isTestFile('apps/api/src/main.ts'), false);
  assert.equal(isTestFile('apps/api/src/testing-tools.ts'), false);
});

// --- Scoped mode (`APP12-G01`) ------------------------------------------------
//
// The point of these is the boundary: scoped mode must measure exactly what it
// is given and never the tree around it, or it inherits the historical debt the
// repository-wide sweep exists to carry.

test('scoped mode measures only the paths it is given', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'apps/api/src/touched.ts', LIMITS.sourceHard + 1);
    makeFile(root, 'apps/api/src/untouched.ts', LIMITS.sourceHard + 1);
    const { checked, violations } = checkScopedFileSizes(['apps/api/src/touched.ts'], root);
    assert.equal(checked, 1);
    assert.deepEqual(
      violations.map((violation) => violation.path),
      ['apps/api/src/touched.ts'],
    );
  });
});

test('scoped mode enforces the §6 limit on a stylesheet the repo-wide sweep ignores', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'apps/storefront/src/styles/huge.scss', LIMITS.sourceHard + 1);
    const scoped = checkScopedFileSizes(['apps/storefront/src/styles/huge.scss'], root);
    assert.equal(scoped.violations.length, 1);
    assert.equal(scoped.violations[0].kind, 'source');
    assert.equal(scoped.violations[0].limit, LIMITS.sourceHard);
    // The repository-wide sweep must stay blind to it — that is the whole
    // reason scoped mode exists rather than a wider default scan.
    assert.equal(checkFileSizes(root).violations.length, 0);
  });
});

test('scoped mode recurses a directory and keeps the test limit', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'apps/api/src/nested/deep/big.spec.ts', LIMITS.testHard + 1);
    makeFile(root, 'apps/api/src/nested/deep/ok.spec.ts', LIMITS.testHard);
    const { checked, violations } = checkScopedFileSizes(['apps/api/src/nested'], root);
    assert.equal(checked, 2);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].kind, 'test');
    assert.equal(violations[0].limit, LIMITS.testHard);
  });
});

test('scoped mode reports a missing path instead of passing silently', () => {
  withFixtureRepo((root) => {
    const { checked, missing, violations } = checkScopedFileSizes(['apps/api/src/gone.ts'], root);
    assert.equal(checked, 0);
    assert.equal(violations.length, 0);
    assert.deepEqual(missing, ['apps/api/src/gone.ts']);
  });
});

test('scoped mode ignores a supplied non-source file and collects nothing with no paths', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'docs/notes.md', 5000);
    assert.equal(checkScopedFileSizes(['docs/notes.md'], root).checked, 0);
    assert.equal(checkScopedFileSizes([], root).checked, 0);
  });
});

test('scoped mode measures a duplicate path once and skips build output', () => {
  withFixtureRepo((root) => {
    makeFile(root, 'apps/api/src/dup.ts', LIMITS.sourceHard + 1);
    makeFile(root, 'apps/api/src/node_modules/lib/huge.ts', 5000);
    const { checked, violations } = checkScopedFileSizes(
      ['apps/api/src/dup.ts', 'apps/api/src', 'apps/api/src/dup.ts'],
      root,
    );
    assert.equal(checked, 1);
    assert.equal(violations.length, 1);
  });
});

test('the usage text names both modes', () => {
  assert.match(usage(), /--paths <path> \[path\.\.\.\]/);
  assert.match(usage(), /\.scss/);
});
