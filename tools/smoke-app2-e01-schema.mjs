#!/usr/bin/env node
/**
 * `APP2-E01-C1` §4/§5 — the disposable database's schema and prerequisites,
 * built by the canonical migration path.
 *
 * WHAT THIS REPLACES
 * ------------------
 * The first `APP2-E01` delivery gave the disposable database its structure with
 * `pg_dump --schema-only` from the developer's database, then copied two
 * prerequisite tables out of it. That is not a reproducible production journey:
 * it inherits whatever local drift the developer's database carries, it can
 * never fail when the migration runner is broken, and its result depends on a
 * machine nobody else has. A journey that means to prove publication end to end
 * has to start from the committed migrations and nothing else.
 *
 * WHAT IT DOES INSTEAD
 * --------------------
 * The run starts an **empty** disposable TLS PostgreSQL and applies the
 * committed migrations with the repository's own runner — the tracked
 * `db-migrate` Compose service, whose command is
 * `pnpm --filter @embroidery/database db:migrate`. The schema is then verified
 * by the committed DB6 checkers and the fingerprint gate, run from inside the
 * same image. Nothing here re-implements a canonical check: a second
 * implementation could drift from the real one and would then prove nothing.
 *
 * CREDENTIALS
 * -----------
 * The disposable database URL reaches the migration container through the
 * Compose override file's `environment:` block, exactly like every other
 * service in this run. The checker scripts take a connection string as
 * `argv[2]`, so they are invoked as `sh -c 'node <checker> "$DATABASE_URL"'`:
 * the container's own shell expands it from its environment, and the credential
 * never appears in any argument vector this harness constructs.
 */
import { randomBytes } from 'node:crypto';

import { WAIT_TIMEOUT_SECONDS, composeArgs } from './smoke-app2-t01-production-topology.mjs';

/** The tracked one-shot that *is* the canonical migration runner. */
export const MIGRATE_SERVICE = 'db-migrate';

/** Frozen DB6 baseline (DEC-DB7-005); moved only by a reviewed schema change. */
export const CANONICAL_MIGRATION_COUNT = 33;
export const CANONICAL_TABLE_COUNT = 78;
export const CANONICAL_COLUMN_COUNT = 833;
export const CANONICAL_CHECK_COUNT = 190;
export const CANONICAL_FINGERPRINT =
  '82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf';

/**
 * The committed DB6 live-catalog checkers, in the order
 * `packages/database/src/testing/verify-schema-baseline.ts` runs them. That
 * module is TypeScript and expects host access to the database; this run's
 * database is reachable only on the Compose network, so the same scripts are
 * executed in the same order from inside the image instead of being rewritten.
 */
export const CANONICAL_CHECKERS = [
  'db-live-tables-check.mjs',
  'db-live-constraints-check.mjs',
  'db-live-indexes-check.mjs',
  'db-live-jsonb-check.mjs',
  'db-live-money-check.mjs',
  'db-live-triggers-check.mjs',
  'db-fingerprint-gate.mjs',
];

const CHECKER_DIR = 'packages/database/tools';

/**
 * The migration one-shot, pointed at the disposable database.
 *
 * `depends_on: !reset []` matters: without it Compose walks the tracked
 * `depends_on: postgres` and starts work against the **developer's** database,
 * which is the exact mistake this checkpoint exists to remove.
 */
export function migrateOverrideYaml({ databaseUrl }) {
  return [
    `  ${MIGRATE_SERVICE}:`,
    '    environment:',
    `      DATABASE_URL: ${databaseUrl}`,
    '      DATABASE_SSL_MODE: require',
    '    depends_on: !reset []',
    '',
  ].join('\n');
}

function runArgs(files, envFile, command) {
  return [
    ...composeArgs(files, envFile),
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'sh',
    MIGRATE_SERVICE,
    '-c',
    command,
  ];
}

/** The canonical runner, invoked exactly as the tracked service declares it. */
export function migrateRunArgs(files, envFile) {
  return runArgs(files, envFile, 'pnpm --filter @embroidery/database db:migrate');
}

/**
 * `pnpm db:status` exits 0 only when the applied history matches the repository
 * exactly — same count, same order, same checksums, nothing pending and nothing
 * ahead. That is the migration-history assertion; re-deriving it here would be
 * a second implementation of the thing being trusted.
 */
export function statusRunArgs(files, envFile) {
  return runArgs(files, envFile, 'pnpm --filter @embroidery/database db:status');
}

/**
 * Re-hashes every migration file against the frozen manifest. `db:status`
 * cannot see a post-hoc edit to an already-applied file; this can.
 */
export function checksumRunArgs(files, envFile) {
  return runArgs(files, envFile, `node ${CHECKER_DIR}/db-migration-checksum-check.mjs`);
}

/** One committed checker, with the URL expanded by the container's own shell. */
export function checkerRunArgs(files, envFile, checker) {
  return runArgs(files, envFile, `node ${CHECKER_DIR}/${checker} "$DATABASE_URL"`);
}

/** Physical counts, read straight from the catalog of the disposable database. */
export const SCHEMA_COUNT_SQL = {
  migrations: 'select count(*) from drizzle.__drizzle_migrations',
  tables: "select count(*) from information_schema.tables where table_schema = 'public'",
  columns: "select count(*) from information_schema.columns where table_schema = 'public'",
  checks: `select count(*) from pg_constraint c
           join pg_namespace n on n.oid = c.connamespace
           where c.contype = 'c' and n.nspname = 'public'`,
  serverVersion: 'show server_version',
};

/** The ordered migration identifiers actually applied, for the evidence record. */
export const APPLIED_MIGRATIONS_SQL =
  'select hash from drizzle.__drizzle_migrations order by created_at, id';

/**
 * The worker runtime policy this run publishes.
 *
 * `APP2-I02` deliberately gives the runtime **no** production default — a
 * worker with no policy is a worker nobody configured — so a fresh database has
 * none and the journey has to publish one. These values are chosen for this
 * run and satisfy every relation the canonical validator enforces
 * (`backoffBaseMs <= backoffMaxMs`, `handlerTimeoutMs + leaseSafetyMarginMs <=
 * leaseDurationMs`, `shutdownGraceMs <= handlerTimeoutMs`, `pollIntervalMs <
 * leaseDurationMs`). They are sized for real image decoding and derivative
 * generation rather than for a fast integration test, and none of them is read
 * from the developer's database.
 */
export const WORKER_RUNTIME_POLICY = {
  concurrency: 2,
  batchSize: 5,
  pollIntervalMs: 500,
  leaseDurationMs: 120_000,
  handlerTimeoutMs: 60_000,
  leaseSafetyMarginMs: 5_000,
  shutdownGraceMs: 10_000,
  maxAttempts: 3,
  backoffBaseMs: 1_000,
  backoffMaxMs: 30_000,
};

export const WORKER_RUNTIME_POLICY_KEY = 'worker.runtime';
export const WORKER_RUNTIME_POLICY_SCHEMA_VERSION = 1;

/**
 * A UUIDv7, built from `crypto.randomBytes` and the current timestamp.
 *
 * The canonical generator lives in `@embroidery/database` (`newId`), which is
 * TypeScript and not importable from a plain `.mjs` tool. The layout is the
 * RFC 9562 one — 48-bit big-endian milliseconds, version 7, variant 10 — so the
 * two fixture rows carry the same shape of identifier as every other row in the
 * table. No `Math.random`, and no second id library added to the workspace.
 */
function uuidV7() {
  const bytes = randomBytes(16);
  const millis = Date.now();
  bytes.writeUIntBE(millis, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Publishes the policy the way the schema requires it to exist: a header row
 * and one immutable version, with the header's pointer updated to it.
 *
 * `created_by_admin_id` is NOT NULL and references `admin_accounts`, so this
 * can only run after the staff identity exists — which is also the honest
 * order: a policy is authored by somebody.
 */
export function workerPolicyStatements(adminId) {
  const configId = uuidV7();
  const versionId = uuidV7();
  const value = JSON.stringify(WORKER_RUNTIME_POLICY).replace(/'/g, "''");
  return {
    configId,
    versionId,
    statements: [
      `insert into policy_configurations (id, config_key, description)
       values ('${configId}', '${WORKER_RUNTIME_POLICY_KEY}',
               'Worker runtime policy (APP2-I02).')`,
      `insert into policy_configuration_versions
         (id, policy_configuration_id, version, value, value_schema_version,
          effective_from, created_by_admin_id, reason)
       values ('${versionId}', '${configId}', 1, '${value}'::jsonb,
               ${WORKER_RUNTIME_POLICY_SCHEMA_VERSION}, now(), '${adminId}',
               'APP2-E01 disposable journey prerequisite')`,
      `update policy_configurations set current_version_id = '${versionId}'
       where id = '${configId}'`,
    ],
  };
}

/**
 * Every mutable catalog and evidence table the journey must fill itself.
 *
 * A fresh migrated database has none of these. Asserting zero is what makes the
 * later deltas mean something: if the journey inherited an Asset or a Product,
 * "one Asset was created" could pass without an upload ever happening.
 */
export const MUTABLE_BASELINE_TABLES = [
  'assets',
  'asset_inspections',
  'asset_derivatives',
  'products',
  'product_media',
  'audit_events',
  'outbox_events',
  'background_job_attempts',
  'admin_accounts',
];

/** Compose `run` inherits no health gating, so the caller waits explicitly. */
export const MIGRATE_TIMEOUT_MS = Number(WAIT_TIMEOUT_SECONDS) * 1000;
