#!/usr/bin/env node
/**
 * DB10 — logical backup.
 *
 * Usage:
 *   node tools/db-backup.mjs --database <name> --out <dir> [--label <slug>]
 *                            [--container <name>] [--retention-class <text>]
 *
 * Produces two files in `--out`:
 *   <backupId>.dump           pg_dump custom format
 *   <backupId>.manifest.json  everything a restore needs to decide whether
 *                             this artifact is the right one and intact
 *
 * The manifest is the point of this tool. A dump file alone cannot tell you
 * which schema version it holds, whether it is complete, or whether it is
 * safe to hand to someone — so a restore from a bare dump is always partly a
 * guess. The manifest records the schema fingerprint, the applied-migration
 * count, exact per-table row counts, the artifact hash, and — stated rather
 * than assumed — that the artifact is neither encrypted nor sanitised.
 *
 * No credential is handled anywhere: the dump runs over the container's local
 * unix socket. See `backup-runtime.mjs`.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import {
  DEFAULT_CONTAINER,
  DEFAULT_ROLE,
  EXIT,
  assertSafeIdentifier,
  fileSize,
  migrationJournalCount,
  parseArgs,
  serverReachable,
  serverVersion,
  sha256OfFile,
  tableRowCounts,
} from './backup-runtime.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FINGERPRINT_TOOL = join(
  REPO_ROOT,
  'packages',
  'database',
  'tools',
  'db-schema-fingerprint.mjs',
);
const USAGE =
  'usage: node tools/db-backup.mjs --database <name> --out <dir> [--label <slug>] ' +
  '[--container <name>] [--retention-class <text>] [--url <fingerprint-url>]';

function log(message) {
  console.log(`[db:backup] ${message}`);
}

function fail(code, message) {
  console.error(`[db:backup] ${message}`);
  process.exit(code);
}

/** `20260721T101530Z-embroidery-label` — sortable, unique per second, self-describing. */
function buildBackupId(database, label) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  return label === undefined ? `${stamp}-${database}` : `${stamp}-${database}-${label}`;
}

/**
 * Streams `pg_dump -Fc` from the container straight to disk.
 *
 * Streaming rather than buffering matters at any realistic size, and it also
 * means a failure mid-dump leaves a truncated file that the caller deletes —
 * never a plausible-looking artifact whose hash nobody checks.
 */
async function dumpToFile(container, database, artifactPath) {
  const child = spawnPgDump(container, database);
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  // `pipeline` owns closing the sink. Ending it by hand races the auto-end
  // that `pipe` already performs, and the loser of that race is a `finish`
  // listener that never fires — a backup that silently produces no manifest.
  const written = pipeline(child.stdout, createWriteStream(artifactPath));
  const exited = new Promise((resolvePromise, rejectPromise) => {
    child.on('error', rejectPromise);
    child.on('close', resolvePromise);
  });

  const [, code] = await Promise.all([written, exited]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `pg_dump exited ${code}`);
  }
}

/**
 * Split out so the pipe above stays readable.
 *
 * `--no-owner`/`--no-privileges` keep the artifact restorable under whatever
 * role the target happens to use, which is the difference between a backup
 * that restores on a new machine and one that only restores on this one.
 */
function spawnPgDump(container, database) {
  return spawn(
    'docker',
    [
      'exec',
      container,
      'pg_dump',
      '-U',
      DEFAULT_ROLE,
      '-d',
      database,
      '--format=custom',
      '--no-owner',
      '--no-privileges',
    ],
    { shell: false },
  );
}

/** The fingerprint gate runs on the host against a TCP url; it is optional. */
function schemaFingerprint(url) {
  if (url === undefined) {
    return null;
  }
  try {
    return execFileSync(process.execPath, [FINGERPRINT_TOOL, url], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), {
      keys: ['database', 'out', 'label', 'container', 'retention-class', 'url'],
      flags: [],
    });
  } catch (error) {
    console.error(`[db:backup] ${error.message}`);
    fail(EXIT.usage, USAGE);
    return;
  }

  if (args.database === undefined || args.out === undefined) {
    fail(EXIT.usage, USAGE);
    return;
  }

  const container = args.container ?? DEFAULT_CONTAINER;
  let database;
  try {
    database = assertSafeIdentifier('--database', args.database);
    if (args.label !== undefined) {
      assertSafeIdentifier('--label', args.label);
    }
  } catch (error) {
    fail(EXIT.usage, error.message);
    return;
  }

  if (!serverReachable(container)) {
    fail(EXIT.unavailable, `no PostgreSQL server answering inside container "${container}".`);
    return;
  }

  const outDir = resolve(args.out);
  const backupId = buildBackupId(database, args.label);
  const artifactPath = join(outDir, `${backupId}.dump`);
  const manifestPath = join(outDir, `${backupId}.manifest.json`);

  let rowCounts;
  let journalCount;
  let version;
  try {
    rowCounts = tableRowCounts(container, database);
    journalCount = migrationJournalCount(container, database);
    version = serverVersion(container);
  } catch (error) {
    fail(EXIT.unavailable, `could not inspect "${database}": ${error.message}`);
    return;
  }

  try {
    await mkdir(outDir, { recursive: true });
  } catch (error) {
    fail(EXIT.failed, `destination is not writable: ${outDir} (${error.code ?? error.message})`);
    return;
  }

  const startedAt = Date.now();
  try {
    await dumpToFile(container, database, artifactPath);
  } catch (error) {
    // A partial dump must never survive: the next operator would find a file
    // with a plausible name and no way to know it is truncated.
    await rm(artifactPath, { force: true });
    fail(EXIT.failed, `pg_dump failed, partial artifact removed: ${error.message}`);
    return;
  }
  const durationMs = Date.now() - startedAt;

  const manifest = {
    backupId,
    createdAt: new Date().toISOString(),
    sourceDatabase: database,
    sourceContainer: container,
    postgresVersion: version,
    schemaFingerprint: schemaFingerprint(args.url),
    appliedMigrations: journalCount,
    format: 'pg_dump/custom',
    compression: 'pg_dump custom default (zlib)',
    artifact: `${backupId}.dump`,
    artifactBytes: await fileSize(artifactPath),
    artifactSha256: await sha256OfFile(artifactPath),
    durationMs,
    tableCount: Object.keys(rowCounts).length,
    totalRows: Object.values(rowCounts).reduce((sum, n) => sum + n, 0),
    rowCounts,
    // Stated, never omitted. An unencrypted, unsanitised dump of this schema
    // holds customer contacts, design documents, payment evidence and admin
    // credential hashes; the manifest says so rather than letting a reader
    // assume otherwise. See DP-BAK-05.
    encryption: 'none',
    sanitization: 'none',
    retentionClassification:
      args['retention-class'] ?? 'unclassified — DP-BAK-02 deferred to business/operations',
    restoreCommand: `node tools/db-restore.mjs --manifest ${backupId}.manifest.json --target <new-database> --create`,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  log(`${backupId} — ${manifest.totalRows} rows across ${manifest.tableCount} tables`);
  log(`artifact ${manifest.artifactBytes} bytes, sha256 ${manifest.artifactSha256.slice(0, 16)}…`);
  log(`encryption=${manifest.encryption} sanitization=${manifest.sanitization}`);
  log(`wrote ${manifestPath}`);
  process.exit(EXIT.ok);
}

main().catch((error) => {
  fail(EXIT.failed, error.message);
});
