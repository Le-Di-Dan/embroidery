/**
 * Schema status and drift detection (DB6 §19).
 *
 * Compares the migration files committed in Git against the history recorded
 * in the database, and reports one of a small set of states. It never repairs
 * anything: auto-repairing migration history is how a "working" database ends
 * up structurally different from what the repository describes.
 *
 * drizzle-kit records a per-file hash, so an *edited* shared migration is
 * detectable — the file list can match while a hash does not.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';

import type { Database } from '../client/create-database-client';
import { MIGRATIONS_FOLDER, MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from './run-migrations';

export type SchemaStatusCode =
  'up-to-date' | 'pending' | 'uninitialised' | 'ahead-of-repository' | 'checksum-mismatch';

export interface SchemaStatus {
  readonly code: SchemaStatusCode;
  readonly repositoryMigrations: number;
  readonly appliedMigrations: number;
  readonly pending: readonly string[];
  readonly problems: readonly string[];
}

/** Mirrors drizzle-kit's hashing so recorded hashes can be compared. */
function hashMigration(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

async function readRepositoryMigrations(): Promise<{ file: string; hash: string }[]> {
  const entries = await readdir(MIGRATIONS_FOLDER).catch(() => [] as string[]);
  const files = entries.filter((entry) => entry.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      hash: hashMigration(await readFile(join(MIGRATIONS_FOLDER, file), 'utf8')),
    })),
  );
}

async function readAppliedHashes(db: Database): Promise<string[] | null> {
  const exists = await db.execute<{ present: boolean }>(sql`
    select exists (
      select 1 from information_schema.tables
      where table_schema = ${MIGRATIONS_SCHEMA} and table_name = ${MIGRATIONS_TABLE}
    ) as present
  `);
  if (exists.rows[0]?.present !== true) {
    return null;
  }
  const applied = await db.execute<{ hash: string }>(
    sql`select hash from ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} order by created_at`,
  );
  return applied.rows.map((row) => row.hash);
}

export async function readSchemaStatus(db: Database): Promise<SchemaStatus> {
  const repository = await readRepositoryMigrations();
  const applied = await readAppliedHashes(db);

  if (applied === null) {
    return {
      code: 'uninitialised',
      repositoryMigrations: repository.length,
      appliedMigrations: 0,
      pending: repository.map((entry) => entry.file),
      problems: [],
    };
  }

  const problems: string[] = [];

  // An applied migration whose file changed means a shared migration was
  // edited. This must fail loudly — the database and the repository now
  // describe different schemas while appearing to agree on the file list.
  const comparable = Math.min(applied.length, repository.length);
  for (let index = 0; index < comparable; index += 1) {
    const expected = repository[index];
    if (expected !== undefined && applied[index] !== expected.hash) {
      problems.push(
        `migration ${expected.file} was applied with a different checksum — a shared migration was edited. ` +
          'Never edit an applied migration: add a new forward migration instead (ADR-DB1-003).',
      );
    }
  }

  if (applied.length > repository.length) {
    problems.push(
      `the database has ${applied.length} applied migrations but the repository has ${repository.length}. ` +
        'This database is ahead of the current branch — switch back, or reset the local volume.',
    );
    return {
      code: 'ahead-of-repository',
      repositoryMigrations: repository.length,
      appliedMigrations: applied.length,
      pending: [],
      problems,
    };
  }

  if (problems.length > 0) {
    return {
      code: 'checksum-mismatch',
      repositoryMigrations: repository.length,
      appliedMigrations: applied.length,
      pending: [],
      problems,
    };
  }

  const pending = repository.slice(applied.length).map((entry) => entry.file);
  return {
    code: pending.length === 0 ? 'up-to-date' : 'pending',
    repositoryMigrations: repository.length,
    appliedMigrations: applied.length,
    pending,
    problems: [],
  };
}
