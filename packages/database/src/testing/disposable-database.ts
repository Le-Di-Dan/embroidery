/**
 * Disposable-database harness for the DB7 integration suites (DEC-DB7-005).
 *
 * Every mutating test runs against a database created for that suite and
 * dropped afterwards — never the persistent development database. The
 * containing PostgreSQL server is the pinned `postgres:16.14-alpine` instance
 * the repository already documents, so this adds no new dependency and no new
 * version surface; it is the same pattern DB6's reproducibility runbook used.
 *
 * Test-only. Nothing here is reachable from application code.
 */
import { Client } from 'pg';

import type { DatabaseClient, DatabaseConfig } from '../index';
import { createDatabaseClient, loadDatabaseConfig, redactUrl, runMigrations } from '../index';
import { migrationsFolder, resolveDatabaseUrl } from './workspace-paths';

/** PostgreSQL's identifier limit; names are truncated rather than silently colliding. */
const MAX_IDENTIFIER_LENGTH = 63;
const MAINTENANCE_DATABASE = 'postgres';

export interface DisposableDatabase {
  readonly name: string;
  readonly url: string;
  readonly config: DatabaseConfig;
  readonly client: DatabaseClient;
  /** Closes the pool and drops the database. Safe to call twice. */
  drop(): Promise<void>;
}

/**
 * Builds a deterministic database name from a suite label.
 *
 * Deterministic (label + pid) rather than random so a crashed run leaves a name
 * an operator can recognise and clean up, while concurrent Jest workers — which
 * are separate processes — still cannot collide.
 */
export function disposableDatabaseName(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `embroidery_db7_${slug}_${process.pid}`.slice(0, MAX_IDENTIFIER_LENGTH);
}

function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/**
 * Runs one statement against the maintenance database.
 *
 * `CREATE`/`DROP DATABASE` cannot run inside a transaction and cannot be
 * parameterised, so the name is interpolated — which is safe only because it
 * comes from `disposableDatabaseName`, whose output is restricted to
 * `[a-z0-9_]`. That restriction is the injection control; do not relax it.
 */
async function runMaintenance(baseUrl: string, statement: string): Promise<void> {
  const client = new Client({ connectionString: withDatabaseName(baseUrl, MAINTENANCE_DATABASE) });
  try {
    await client.connect();
  } catch (error: unknown) {
    throw new Error(
      `Could not reach the PostgreSQL server at ${redactUrl(baseUrl)}: ${codeOf(error)}. ` +
        'Start it with `pnpm db:up`.',
      { cause: error },
    );
  }
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

/**
 * Creates a fresh database, applies all migrations, and returns a live client.
 *
 * `NODE_ENV=test` is forced for the config load so the production safety checks
 * in `loadDatabaseConfig` cannot be tripped by a developer's shell.
 */
export async function createDisposableDatabase(label: string): Promise<DisposableDatabase> {
  const baseUrl = resolveDatabaseUrl();
  const name = disposableDatabaseName(label);
  const url = withDatabaseName(baseUrl, name);

  await runMaintenance(baseUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await runMaintenance(baseUrl, `CREATE DATABASE ${name}`);

  const config = loadDatabaseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    DATABASE_SSL_MODE: 'disable',
  });

  let client: DatabaseClient;
  try {
    await runMigrations(config, migrationsFolder());
    client = createDatabaseClient(config);
  } catch (error: unknown) {
    // Leave nothing behind when setup fails half-way, or the next run inherits
    // a partially-migrated database and reports a confusing schema error.
    await runMaintenance(baseUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    throw error;
  }

  let dropped = false;
  return {
    name,
    url,
    config,
    client,
    drop: async (): Promise<void> => {
      if (dropped) {
        return;
      }
      dropped = true;
      await client.close();
      await runMaintenance(baseUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    },
  };
}

function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code !== '') {
      return code;
    }
  }
  return 'unknown driver error';
}
