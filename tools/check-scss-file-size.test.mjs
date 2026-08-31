/**
 * Tests for the scoped SCSS source-size gate (`FU-APP11-A02-C1-01`).
 * Pure Node (node:test); disposable fixtures under the OS temp dir.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  SCSS_LIMITS,
  checkScssFileSizes,
  collectScssFiles,
  usage,
} from './check-scss-file-size.mjs';

function withTempDir(run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'scss-size-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Writes a stylesheet of exactly `lines` lines. */
function writeScss(dir, name, lines) {
  const full = path.join(dir, name);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${Array.from({ length: lines }, (_, i) => `// ${i}`).join('\n')}\n`, 'utf8');
  return full;
}

test('a stylesheet at exactly the hard limit passes', () => {
  withTempDir((dir) => {
    writeScss(dir, 'at-limit.scss', SCSS_LIMITS.hard);
    const result = checkScssFileSizes([path.join(dir, 'at-limit.scss')], dir);
    assert.equal(result.checked, 1);
    assert.deepEqual(result.violations, []);
  });
});

test('a stylesheet one line over the hard limit fails, reporting path and count', () => {
  withTempDir((dir) => {
    writeScss(dir, 'over.scss', SCSS_LIMITS.hard + 1);
    const result = checkScssFileSizes([path.join(dir, 'over.scss')], dir);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].path, 'over.scss');
    assert.equal(result.violations[0].lines, SCSS_LIMITS.hard + 1);
    assert.equal(result.violations[0].limit, SCSS_LIMITS.hard);
  });
});

test('a stylesheet over the review threshold warns but does not fail', () => {
  withTempDir((dir) => {
    writeScss(dir, 'review.scss', SCSS_LIMITS.review + 1);
    const result = checkScssFileSizes([path.join(dir, 'review.scss')], dir);
    assert.deepEqual(result.violations, []);
    assert.equal(result.warnings.length, 1);
  });
});

test('a directory argument recurses into subdirectories', () => {
  withTempDir((dir) => {
    writeScss(dir, 'top.scss', 10);
    writeScss(dir, path.join('nested', 'deep', '_partial.scss'), SCSS_LIMITS.hard + 5);
    const result = checkScssFileSizes([dir], dir);
    assert.equal(result.checked, 2);
    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0].path, /_partial\.scss$/);
  });
});

test('node_modules and build output are skipped during recursion', () => {
  withTempDir((dir) => {
    writeScss(dir, 'own.scss', 10);
    writeScss(dir, path.join('node_modules', 'vendor.scss'), SCSS_LIMITS.hard + 50);
    writeScss(dir, path.join('.next', 'built.scss'), SCSS_LIMITS.hard + 50);
    const result = checkScssFileSizes([dir], dir);
    assert.equal(result.checked, 1);
    assert.deepEqual(result.violations, []);
  });
});

test('non-SCSS files in the supplied list are ignored', () => {
  withTempDir((dir) => {
    writeFileSync(path.join(dir, 'huge.tsx'), 'x\n'.repeat(SCSS_LIMITS.hard + 100), 'utf8');
    writeScss(dir, 'small.scss', 5);
    const result = checkScssFileSizes(
      [path.join(dir, 'huge.tsx'), path.join(dir, 'small.scss')],
      dir,
    );
    assert.equal(result.checked, 1);
    assert.deepEqual(result.violations, []);
  });
});

test('a path that does not exist is reported rather than silently skipped', () => {
  withTempDir((dir) => {
    const result = checkScssFileSizes([path.join(dir, 'absent.scss')], dir);
    assert.equal(result.missing.length, 1);
  });
});

test('the same stylesheet supplied twice is measured once', () => {
  withTempDir((dir) => {
    const file = writeScss(dir, 'once.scss', 10);
    const result = checkScssFileSizes([file, dir], dir);
    assert.equal(result.checked, 1);
  });
});

test('there is no repository-wide mode: no arguments collects nothing', () => {
  // The CLI turns this into usage + exit 1. What matters here is that the
  // library half cannot be coaxed into a global sweep of historical debt.
  const result = collectScssFiles([], process.cwd());
  assert.deepEqual(result.files, []);
  assert.match(usage(), /no repository-wide mode/i);
});
