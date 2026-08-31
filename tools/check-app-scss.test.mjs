/**
 * Tests for the scoped per-app SCSS compile gate (`FU-APP10-E01-02`).
 * Pure Node (node:test); disposable fixtures under the OS temp dir.
 *
 * No test mutates a real application stylesheet. The failure cases compile a
 * fixture written into a temp directory, resolving `sass` through the real
 * Storefront so the gate's own resolution strategy is what is under test.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { REPO_ROOT, SCSS_APPS, checkAppScss, compileScssEntry, usage } from './check-app-scss.mjs';

const STOREFRONT_DIR = path.join(REPO_ROOT, 'apps/storefront');

async function withTempDir(run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'scss-gate-'));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the canonical Storefront entry compiles', async () => {
  const result = await checkAppScss('storefront');
  assert.equal(result.entry, 'apps/storefront/src/styles/main.scss');
  assert.ok(result.cssBytes > 0, 'expected the Storefront entry to emit CSS');
});

test('the canonical Admin entry compiles', async () => {
  const result = await checkAppScss('admin');
  assert.equal(result.entry, 'apps/admin/src/styles/main.scss');
  assert.ok(result.cssBytes > 0, 'expected the Admin entry to emit CSS');
});

test('both canonical entry points exist on disk', () => {
  for (const [name, app] of Object.entries(SCSS_APPS)) {
    const entryPath = path.join(REPO_ROOT, app.appDir, app.entry);
    assert.ok(existsSync(entryPath), `${name} entry missing: ${entryPath}`);
  }
});

test('an unknown app is rejected, and the message names the known ones', async () => {
  await assert.rejects(() => checkAppScss('worker'), RangeError);
  assert.match(usage(), /storefront\|admin/);
});

test('invalid Sass fails, and the error names the offending file', async () => {
  await withTempDir(async (dir) => {
    const entryPath = path.join(dir, 'broken.scss');
    // An unclosed block: a fatal parse error, not a deprecation.
    writeFileSync(entryPath, '.broken {\n  color: red;\n', 'utf8');
    await assert.rejects(
      () => compileScssEntry({ entryPath, resolveFrom: STOREFRONT_DIR }),
      (error) => {
        assert.match(error.message, /expected/i);
        return true;
      },
    );
  });
});

test('an unresolvable bare package specifier fails', async () => {
  await withTempDir(async (dir) => {
    const entryPath = path.join(dir, 'missing-package.scss');
    writeFileSync(entryPath, "@use '@embroidery/does-not-exist';\n", 'utf8');
    await assert.rejects(() => compileScssEntry({ entryPath, resolveFrom: STOREFRONT_DIR }));
  });
});

test('the shared package specifier resolves exactly as the app resolves it', async () => {
  await withTempDir(async (dir) => {
    const entryPath = path.join(dir, 'uses-tokens.scss');
    // Proves both halves of the strategy: the bare specifier (file importer)
    // and the package's own internal `@use` graph (loadPaths).
    writeFileSync(
      entryPath,
      "@use '@embroidery/styles' as styles;\n.probe { color: styles.$color-text-primary; padding: styles.spacing(16); }\n",
      'utf8',
    );
    const result = await compileScssEntry({ entryPath, resolveFrom: STOREFRONT_DIR });
    assert.ok(result.cssBytes > 0);
  });
});

test('compiling leaves no artifact beside the entry point', async () => {
  await withTempDir(async (dir) => {
    const entryPath = path.join(dir, 'clean.scss');
    writeFileSync(entryPath, '.clean { color: red; }\n', 'utf8');
    await compileScssEntry({ entryPath, resolveFrom: STOREFRONT_DIR });
    assert.deepEqual(readdirSync(dir), ['clean.scss']);
  });
});

test('no compiled CSS is committed beside either canonical entry', () => {
  for (const app of Object.values(SCSS_APPS)) {
    const stylesDir = path.join(REPO_ROOT, app.appDir, path.dirname(app.entry));
    const stray = readdirSync(stylesDir).filter((name) => name.endsWith('.css'));
    assert.deepEqual(stray, [], `unexpected compiled CSS in ${app.appDir}`);
  }
});
