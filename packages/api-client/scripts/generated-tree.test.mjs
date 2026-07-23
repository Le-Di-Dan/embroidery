import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { checkGeneratedClient } from './check-generated-client.mjs';
import { diffTrees, hashGeneratedTree, listGeneratedFiles } from './generated-tree.mjs';
import { GENERATED_DIR } from './orval-config.mjs';

/** Build a `hashGeneratedTree`-shaped result from a plain {path: hash} map. */
function tree(map) {
  return { files: Object.keys(map).sort(), fileHashes: new Map(Object.entries(map)) };
}

describe('diffTrees', () => {
  test('identical trees are in sync', () => {
    const a = tree({ 'a.ts': 'h1', 'b.ts': 'h2' });
    const b = tree({ 'a.ts': 'h1', 'b.ts': 'h2' });
    assert.deepEqual(diffTrees(a, b), { inSync: true, missing: [], unexpected: [], changed: [] });
  });

  test('changed content fails with the file listed', () => {
    const expected = tree({ 'a.ts': 'h1', 'b.ts': 'NEW' });
    const tracked = tree({ 'a.ts': 'h1', 'b.ts': 'h2' });
    const result = diffTrees(expected, tracked);
    assert.equal(result.inSync, false);
    assert.deepEqual(result.changed, ['b.ts']);
  });

  test('a file missing from tracked fails as missing', () => {
    const expected = tree({ 'a.ts': 'h1', 'b.ts': 'h2' });
    const tracked = tree({ 'a.ts': 'h1' });
    const result = diffTrees(expected, tracked);
    assert.equal(result.inSync, false);
    assert.deepEqual(result.missing, ['b.ts']);
  });

  test('a stale tracked file fails as unexpected', () => {
    const expected = tree({ 'a.ts': 'h1' });
    const tracked = tree({ 'a.ts': 'h1', 'stale.ts': 'h9' });
    const result = diffTrees(expected, tracked);
    assert.equal(result.inSync, false);
    assert.deepEqual(result.unexpected, ['stale.ts']);
  });
});

describe('hashGeneratedTree / listGeneratedFiles', () => {
  let dir;
  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'gen-tree-'));
    await mkdir(path.join(dir, 'nested'), { recursive: true });
    await writeFile(path.join(dir, 'b.ts'), 'export const b = 1;\n', 'utf8');
    await writeFile(path.join(dir, 'a.ts'), 'export const a = 1;\n', 'utf8');
    await writeFile(path.join(dir, 'nested', 'c.ts'), 'export const c = 1;\n', 'utf8');
  });
  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('lists files sorted with forward-slash relative paths', async () => {
    const files = await listGeneratedFiles(dir);
    assert.deepEqual(files, ['a.ts', 'b.ts', 'nested/c.ts']);
  });

  test('hash is stable across runs and content-sensitive', async () => {
    const first = await hashGeneratedTree(dir);
    const second = await hashGeneratedTree(dir);
    assert.equal(first.hash, second.hash);
    await writeFile(path.join(dir, 'a.ts'), 'export const a = 2;\n', 'utf8');
    const changed = await hashGeneratedTree(dir);
    assert.notEqual(changed.hash, first.hash);
  });
});

describe('checkGeneratedClient (integration)', () => {
  test('tracked client is in sync, and the check is non-mutating and cleans up', async () => {
    const before = await hashGeneratedTree(GENERATED_DIR);
    const tmpBefore = (await readdir(os.tmpdir())).filter((n) =>
      n.startsWith('embroidery-api-client-drift-'),
    ).length;

    const result = await checkGeneratedClient();
    assert.equal(result.inSync, true, 'tracked generated client must match a fresh generation');

    const afterTree = await hashGeneratedTree(GENERATED_DIR);
    assert.equal(afterTree.hash, before.hash, 'drift check must not mutate tracked files');

    const tmpAfter = (await readdir(os.tmpdir())).filter((n) =>
      n.startsWith('embroidery-api-client-drift-'),
    ).length;
    assert.equal(tmpAfter, tmpBefore, 'drift check must remove its temp directory');
  });
});
