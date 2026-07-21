#!/usr/bin/env node
/**
 * DB10 — logical restore.
 *
 * Usage:
 *   node tools/db-restore.mjs --manifest <path> --target <database>
 *                             [--create] [--container <name>]
 *                             [--schema-only | --data-only] [--verify-only]
 *
 * The artifact hash is checked against the manifest **before** anything is
 * restored. A corrupted or substituted dump therefore fails at a known point
 * with a clear code, instead of half-populating a database and leaving an
 * operator to work out which tables made it.
 *
 * `--create` creates the target database. Without it the target must already
 * exist and be empty of the public schema's tables; this tool never drops an
 * existing database, because "restore over the top of it" is exactly how a
 * recovery turns into a second incident.
 */
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';

import {
  DEFAULT_CONTAINER,
  DEFAULT_ROLE,
  EXIT,
  assertSafeIdentifier,
  databaseExists,
  execInContainer,
  migrationJournalCount,
  parseArgs,
  psql,
  readManifest,
  serverReachable,
  sha256OfFile,
  tableRowCounts,
} from './backup-runtime.mjs';

const USAGE =
  'usage: node tools/db-restore.mjs --manifest <path> --target <database> ' +
  '[--create] [--container <name>] [--schema-only|--data-only] [--verify-only]';

function log(message) {
  console.log(`[db:restore] ${message}`);
}

function fail(code, message) {
  console.error(`[db:restore] ${message}`);
  process.exit(code);
}

/** Compares the restored per-table counts against the manifest's. */
function compareRowCounts(expected, actual) {
  const differences = [];
  for (const [table, count] of Object.entries(expected)) {
    const restored = actual[table];
    if (restored !== count) {
      differences.push(`${table}: expected ${count}, restored ${restored ?? 'missing table'}`);
    }
  }
  for (const table of Object.keys(actual)) {
    if (expected[table] === undefined) {
      differences.push(`${table}: present after restore but absent from the manifest`);
    }
  }
  return differences;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), {
      keys: ['manifest', 'target', 'container'],
      flags: ['create', 'schema-only', 'data-only', 'verify-only', 'keep-failed'],
    });
  } catch (error) {
    console.error(`[db:restore] ${error.message}`);
    fail(EXIT.usage, USAGE);
    return;
  }

  if (args.manifest === undefined || args.target === undefined) {
    fail(EXIT.usage, USAGE);
    return;
  }
  if (args['schema-only'] === true && args['data-only'] === true) {
    fail(EXIT.usage, '--schema-only and --data-only are mutually exclusive.');
    return;
  }

  const container = args.container ?? DEFAULT_CONTAINER;
  let target;
  try {
    target = assertSafeIdentifier('--target', args.target);
  } catch (error) {
    fail(EXIT.usage, error.message);
    return;
  }

  const manifestPath = resolve(args.manifest);
  let manifest;
  try {
    manifest = await readManifest(manifestPath);
  } catch (error) {
    fail(EXIT.usage, `unreadable manifest: ${error.message}`);
    return;
  }

  const artifactPath = isAbsolute(manifest.artifact)
    ? manifest.artifact
    : join(dirname(manifestPath), manifest.artifact);

  let actualHash;
  try {
    actualHash = await sha256OfFile(artifactPath);
  } catch (error) {
    fail(EXIT.corrupt, `artifact is unreadable: ${artifactPath} (${error.code ?? error.message})`);
    return;
  }

  if (actualHash !== manifest.artifactSha256) {
    fail(
      EXIT.corrupt,
      `artifact hash mismatch — refusing to restore.\n` +
        `[db:restore]   manifest: ${manifest.artifactSha256}\n` +
        `[db:restore]   artifact: ${actualHash}`,
    );
    return;
  }
  log(`artifact integrity verified (sha256 ${actualHash.slice(0, 16)}…)`);

  if (args['verify-only'] === true) {
    log('--verify-only: integrity confirmed, nothing restored.');
    process.exit(EXIT.ok);
    return;
  }

  if (!serverReachable(container)) {
    fail(EXIT.unavailable, `no PostgreSQL server answering inside container "${container}".`);
    return;
  }

  let createdHere = false;
  /**
   * A restore that fails part-way leaves a database that looks real and is
   * not. If this tool created it, this tool removes it — the artifact is
   * still on disk for a diagnostic re-run, so nothing is lost except a trap.
   * `--keep-failed` opts out when the wreckage itself is what you need.
   */
  const abandonTarget = (code, message) => {
    if (createdHere && args['keep-failed'] !== true) {
      execInContainer(container, ['dropdb', '-U', DEFAULT_ROLE, '--force', target]);
      console.error(`[db:restore] dropped the partially restored database "${target}".`);
    } else if (createdHere) {
      console.error(`[db:restore] --keep-failed: "${target}" is left half-restored for diagnosis.`);
    }
    fail(code, message);
  };

  const exists = databaseExists(container, target);
  if (args.create === true) {
    if (exists) {
      fail(
        EXIT.failed,
        `--create was given but "${target}" already exists; refusing to replace it.`,
      );
      return;
    }
    const created = execInContainer(container, ['createdb', '-U', DEFAULT_ROLE, target]);
    if (created.status !== EXIT.ok) {
      fail(EXIT.failed, `could not create "${target}": ${created.stderr}`);
      return;
    }
    createdHere = true;
    log(`created empty database "${target}"`);
  } else if (!exists) {
    fail(EXIT.failed, `target "${target}" does not exist; pass --create to create it.`);
    return;
  }

  const restoreArgs = [
    'pg_restore',
    '-U',
    DEFAULT_ROLE,
    '-d',
    target,
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
  ];
  if (args['schema-only'] === true) restoreArgs.push('--schema-only');
  if (args['data-only'] === true) restoreArgs.push('--data-only');

  const startedAt = Date.now();
  const dump = await readFile(artifactPath);
  const restored = execInContainer(container, restoreArgs, { stdin: dump });
  const durationMs = Date.now() - startedAt;

  if (restored.status !== EXIT.ok) {
    abandonTarget(EXIT.failed, `pg_restore failed after ${durationMs} ms: ${restored.stderr}`);
    return;
  }
  log(`pg_restore completed in ${durationMs} ms`);

  if (args['schema-only'] === true) {
    log('--schema-only: row counts intentionally not compared.');
    process.exit(EXIT.ok);
    return;
  }

  const actualCounts = tableRowCounts(container, target);
  const differences = compareRowCounts(manifest.rowCounts, actualCounts);
  if (differences.length > 0) {
    for (const difference of differences.slice(0, 20)) {
      console.error(`[db:restore]   ${difference}`);
    }
    abandonTarget(EXIT.failed, `row-count parity FAILED for ${differences.length} table(s).`);
    return;
  }

  const journal = migrationJournalCount(container, target);
  const tables = psql(
    container,
    target,
    "select count(*) from information_schema.tables where table_schema = 'public'",
  );

  log(
    `row-count parity OK — ${Object.values(actualCounts).reduce((s, n) => s + n, 0)} rows across ` +
      `${Object.keys(actualCounts).length} tables`,
  );
  log(`public tables: ${tables}; applied migrations in journal: ${journal ?? 'none recorded'}`);
  if (manifest.appliedMigrations !== null && journal !== manifest.appliedMigrations) {
    abandonTarget(
      EXIT.failed,
      `migration journal mismatch: manifest ${manifest.appliedMigrations}, restored ${journal}.`,
    );
    return;
  }
  log('restore verified.');
  process.exit(EXIT.ok);
}

main().catch((error) => {
  fail(EXIT.failed, error.message);
});
