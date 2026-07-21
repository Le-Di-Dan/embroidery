/**
 * Harness for the DB10 backup/restore rehearsals (DB10-CP2).
 *
 * Two things the other harnesses cannot do:
 *
 * 1. **Invoke the real tools.** `tools/db-backup.mjs` and
 *    `tools/db-restore.mjs` are executed as processes, exactly as an
 *    operator would run them. A rehearsal that reimplemented `pg_dump` in
 *    the test would prove the test works, not the tool.
 * 2. **Attach to a database this harness did not create.** A restored
 *    database has an arbitrary name and no `DisposableDatabase` behind it,
 *    so `attachActor` compiles a Nest module against a bare URL and the
 *    repositories then run against the restored data for real.
 *
 * Test-only.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { ModuleMetadata } from '@nestjs/common';
import { findWorkspaceRoot, resolveDatabaseUrl } from '@embroidery/database/testing';
import type { TransactionRunOptions } from '@embroidery/persistence';

import { compileActor } from '../integration/db8-concurrency-context';

const run = promisify(execFile);

/** Generous: a restore of the representative dataset is seconds, but CI is not. */
const TOOL_TIMEOUT_MS = 600_000;

export interface ToolResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface BackupManifest {
  readonly backupId: string;
  readonly artifact: string;
  readonly artifactSha256: string;
  readonly artifactBytes: number;
  readonly postgresVersion: string;
  readonly appliedMigrations: number | null;
  readonly schemaFingerprint: string | null;
  readonly tableCount: number;
  readonly totalRows: number;
  readonly rowCounts: Readonly<Record<string, number>>;
  readonly encryption: string;
  readonly sanitization: string;
  readonly durationMs: number;
}

function toolPath(script: string): string {
  return join(findWorkspaceRoot(), 'tools', script);
}

/**
 * Runs a repository tool and returns its exit code rather than throwing.
 *
 * Every failure fixture in DB10 asserts on a specific exit code, so a
 * non-zero status is an expected outcome here, not an error.
 */
export async function runTool(script: string, args: readonly string[]): Promise<ToolResult> {
  try {
    const { stdout, stderr } = await run(process.execPath, [toolPath(script), ...args], {
      timeout: TOOL_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: 0, stdout, stderr };
  } catch (error: unknown) {
    const failure = error as { code?: unknown; stdout?: string; stderr?: string };
    return {
      status: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

/** A scratch directory for artifacts, removed by `dispose`. */
export interface BackupWorkspace {
  readonly directory: string;
  dispose(): Promise<void>;
}

export async function createBackupWorkspace(label: string): Promise<BackupWorkspace> {
  const directory = await mkdtemp(join(tmpdir(), `db10-${label}-`));
  return {
    directory,
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}

export async function readBackupManifest(path: string): Promise<BackupManifest> {
  return JSON.parse(await readFile(path, 'utf8')) as BackupManifest;
}

/** `<workspace>/<backupId>.manifest.json` for the backup just taken. */
export function manifestPathFor(directory: string, stdout: string): string {
  const match = /\[db:backup\] (\S+) —/.exec(stdout);
  if (match === null) {
    throw new Error(`Could not find a backup id in the tool output:\n${stdout}`);
  }
  return join(directory, `${match[1]}.manifest.json`);
}

/** Swaps the database name in the ambient dev URL, without touching credentials. */
export function urlForDatabase(name: string): string {
  const parsed = new URL(resolveDatabaseUrl());
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/** The container that backs the rehearsal (matches the tools' default). */
const CONTAINER = process.env.DB_BACKUP_CONTAINER ?? 'embroidery-dev-postgres-1';
const ROLE = process.env.DB_BACKUP_ROLE ?? 'embroidery';

/**
 * Runs a maintenance statement through the container's own client, over its
 * local socket (DEC-DB10-006) — so cleanup handles no credential either, and
 * the rehearsal needs no `pg` dependency in the API package.
 */
async function maintenancePsql(statement: string): Promise<string> {
  const { stdout } = await run(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', ROLE, '-d', 'postgres', '-tAc', statement],
    { timeout: 60_000 },
  );
  return stdout.trim();
}

/**
 * Drops a database if it exists. Rehearsals create real databases with real
 * names; leaving one behind would break the cleanup rule and collide with
 * the next run. `FORCE` because a failed rehearsal can leave a connection
 * open.
 */
export async function dropDatabaseIfExists(name: string): Promise<void> {
  await run('docker', ['exec', CONTAINER, 'dropdb', '-U', ROLE, '--if-exists', '--force', name], {
    timeout: 60_000,
  });
}

/** Names of every database whose name starts with the given prefix. */
export async function databasesMatching(prefix: string): Promise<string[]> {
  const rows = await maintenancePsql(
    `select datname from pg_database where datname like '${prefix}%' order by 1`,
  );
  return rows === '' ? [] : rows.split('\n').map((line) => line.trim());
}

export interface AttachedActor {
  get<T>(token: unknown): T;
  inTransaction<T>(work: () => T | Promise<T>, options?: TransactionRunOptions): Promise<T>;
  close(): Promise<void>;
}

/**
 * Compiles a Nest module against an existing database by URL.
 *
 * This is what makes "the restore is verified" mean something stronger than
 * a row count: the application's own repositories read the restored rows
 * through the same code path production would use.
 */
export async function attachActor(
  label: string,
  imports: NonNullable<ModuleMetadata['imports']>,
  databaseName: string,
): Promise<AttachedActor> {
  const { moduleRef, transactions } = await compileActor(
    label,
    urlForDatabase(databaseName),
    imports,
  );
  return {
    get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
    inTransaction: (work, options) => transactions.runInTransaction(work, options),
    close: () => moduleRef.close(),
  };
}
