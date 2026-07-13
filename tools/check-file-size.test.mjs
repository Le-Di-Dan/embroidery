/**
 * Verification for tools/check-file-size.mjs using node:test (no extra
 * dependencies). Run from the repository root:  node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkFileSizes, isTestFile, LIMITS } from './check-file-size.mjs';

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
