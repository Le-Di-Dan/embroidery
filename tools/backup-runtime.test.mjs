/**
 * Unit tests for the DB10 backup/restore runtime.
 *
 * These cover the argument and identifier handling that decides whether a
 * command is even allowed to reach PostgreSQL. They deliberately do **not**
 * start a container: the end-to-end backup/restore rehearsal lives in
 * `apps/api/src/tests/durability/`, where a disposable database and the real
 * repositories are available. Splitting them keeps `pnpm test` meaningful on
 * a machine with no Docker daemon running.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { EXIT, assertSafeIdentifier, parseArgs, readManifest } from './backup-runtime.mjs';

test('exit codes are distinct so callers can branch on them', () => {
  const values = Object.values(EXIT);
  assert.equal(new Set(values).size, values.length);
  assert.equal(EXIT.ok, 0);
});

test('assertSafeIdentifier accepts ordinary database names', () => {
  assert.equal(assertSafeIdentifier('--database', 'embroidery'), 'embroidery');
  assert.equal(
    assertSafeIdentifier('--database', 'embroidery_db10_restore_a'),
    'embroidery_db10_restore_a',
  );
  assert.equal(assertSafeIdentifier('--database', '_leading_underscore'), '_leading_underscore');
});

test('assertSafeIdentifier rejects anything that could break out of an identifier', () => {
  for (const value of [
    'x";drop database embroidery;--',
    'has space',
    'Uppercase',
    '1leading_digit',
    '',
    'a'.repeat(64),
    null,
    undefined,
  ]) {
    assert.throws(() => assertSafeIdentifier('--database', value), /must match/);
  }
});

test('parseArgs reads keyed options and flags', () => {
  const parsed = parseArgs(['--database', 'embroidery', '--out', './backups', '--create'], {
    keys: ['database', 'out'],
    flags: ['create'],
  });
  assert.deepEqual(parsed, { database: 'embroidery', out: './backups', create: true });
});

test('parseArgs rejects an unknown option rather than ignoring it', () => {
  // A silently ignored `--ou` would put the backup somewhere nobody looks.
  assert.throws(
    () => parseArgs(['--ou', './backups'], { keys: ['out'], flags: [] }),
    /unknown option: --ou/,
  );
});

test('parseArgs rejects a keyed option with no value', () => {
  assert.throws(
    () => parseArgs(['--out', '--create'], { keys: ['out'], flags: ['create'] }),
    /--out requires a value/,
  );
  assert.throws(() => parseArgs(['--out'], { keys: ['out'], flags: [] }), /--out requires a value/);
});

test('parseArgs rejects a bare positional argument', () => {
  assert.throws(() => parseArgs(['backups'], { keys: ['out'], flags: [] }), /unexpected argument/);
});

test('readManifest rejects a manifest missing any field a restore depends on', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'db10-manifest-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const complete = {
    backupId: 'b1',
    artifact: 'b1.dump',
    artifactSha256: 'a'.repeat(64),
    format: 'pg_dump/custom',
    rowCounts: { orders: 3 },
  };

  const goodPath = join(dir, 'good.json');
  await writeFile(goodPath, JSON.stringify(complete), 'utf8');
  assert.deepEqual(await readManifest(goodPath), complete);

  for (const field of Object.keys(complete)) {
    const partial = { ...complete };
    delete partial[field];
    const path = join(dir, `missing-${field}.json`);
    await writeFile(path, JSON.stringify(partial), 'utf8');
    await assert.rejects(readManifest(path), new RegExp(`missing required field "${field}"`));
  }
});
