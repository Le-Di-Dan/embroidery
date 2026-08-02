#!/usr/bin/env node
/**
 * `APP2-E01-C1` §4/§5/§7 — building the disposable database and proving what it
 * contains, before a single application starts.
 *
 * Three steps, in this order and no other:
 *
 *   1. apply the committed migrations with the repository's own runner;
 *   2. verify the result against the committed DB6 checkers and the frozen
 *      fingerprint, and record the baseline;
 *   3. bootstrap the four prerequisites a person would need before they could
 *      publish anything — staff identity, worker runtime policy, and (by the
 *      applications' own startup) the private buckets. The fixed categories
 *      arrive with migration 0033.
 *
 * Nothing here reads or writes the developer's database or object store.
 */
import {
  APPLIED_MIGRATIONS_SQL,
  CANONICAL_CHECK_COUNT,
  CANONICAL_CHECKERS,
  CANONICAL_COLUMN_COUNT,
  CANONICAL_FINGERPRINT,
  CANONICAL_MIGRATION_COUNT,
  CANONICAL_TABLE_COUNT,
  MIGRATE_TIMEOUT_MS,
  MUTABLE_BASELINE_TABLES,
  SCHEMA_COUNT_SQL,
  WORKER_RUNTIME_POLICY,
  WORKER_RUNTIME_POLICY_KEY,
  checkerRunArgs,
  checksumRunArgs,
  migrateRunArgs,
  statusRunArgs,
  workerPolicyStatements,
} from './smoke-app2-e01-schema.mjs';
import { bootstrapStaff, sql, sqlCount, sqlRows } from './smoke-app2-e01-fixtures.mjs';
import { API_CONTAINER } from './smoke-app2-t01-production-topology.mjs';

/** A Compose `run` step that must succeed, with its output kept for evidence. */
function must(docker, label, args, record, detail = {}) {
  const result = docker.run(args, { timeout: MIGRATE_TIMEOUT_MS });
  record(label, result.status === 0, { exit: result.status, ...detail });
  if (result.status !== 0) {
    console.error(result.stdout.slice(-4000));
    console.error(result.stderr.slice(-4000));
    throw new Error(`${label} failed (${result.status})`);
  }
  return result;
}

/**
 * Applies every committed migration with the tracked `db-migrate` one-shot,
 * whose command is `pnpm --filter @embroidery/database db:migrate`.
 *
 * `db:status` then decides whether the history is right. It exits 0 only when
 * the applied set matches the repository exactly — right count, right order,
 * right checksums, nothing pending, nothing ahead — so it is the assertion
 * rather than a hand-rolled comparison that could disagree with the runner it
 * is supposed to be checking.
 */
export function applyCanonicalMigrations({ record, docker, files, envFile }) {
  must(
    docker,
    'the canonical migration runner applied the committed migrations',
    migrateRunArgs(files, envFile),
    record,
    { runner: 'pnpm --filter @embroidery/database db:migrate' },
  );

  const status = must(
    docker,
    'migration history matches the repository exactly (db:status)',
    statusRunArgs(files, envFile),
    record,
  );
  const summary = /migrations\s+(\d+) applied \/ (\d+) in repository/.exec(status.stdout);
  record(
    `all ${String(CANONICAL_MIGRATION_COUNT)} committed migrations are applied and none is pending`,
    Number(summary?.[1]) === CANONICAL_MIGRATION_COUNT &&
      Number(summary?.[2]) === CANONICAL_MIGRATION_COUNT,
    { applied: Number(summary?.[1]), inRepository: Number(summary?.[2]) },
  );

  must(
    docker,
    'every migration file still matches its frozen checksum',
    checksumRunArgs(files, envFile),
    record,
  );
}

/**
 * Runs the committed DB6 live-catalog checkers and the fingerprint gate, then
 * records the physical baseline.
 *
 * The checkers are the canonical ones, in the canonical order. A second
 * implementation of them here could drift from the real gate and would then
 * prove nothing at all.
 */
export function verifyCanonicalSchema(record, { docker, files, envFile }) {
  for (const checker of CANONICAL_CHECKERS) {
    must(
      docker,
      `canonical schema checker passed: ${checker}`,
      checkerRunArgs(files, envFile, checker),
      record,
    );
  }

  const counts = {
    migrations: sqlCount(SCHEMA_COUNT_SQL.migrations),
    tables: sqlCount(SCHEMA_COUNT_SQL.tables),
    columns: sqlCount(SCHEMA_COUNT_SQL.columns),
    checks: sqlCount(SCHEMA_COUNT_SQL.checks),
  };
  record(
    'the disposable schema reproduces the frozen physical baseline',
    counts.migrations === CANONICAL_MIGRATION_COUNT &&
      counts.tables === CANONICAL_TABLE_COUNT &&
      counts.columns === CANONICAL_COLUMN_COUNT &&
      counts.checks === CANONICAL_CHECK_COUNT,
    {
      ...counts,
      expected: {
        migrations: CANONICAL_MIGRATION_COUNT,
        tables: CANONICAL_TABLE_COUNT,
        columns: CANONICAL_COLUMN_COUNT,
        checks: CANONICAL_CHECK_COUNT,
      },
    },
  );

  const applied = sqlRows(APPLIED_MIGRATIONS_SQL);
  const serverVersion = sql(SCHEMA_COUNT_SQL.serverVersion);
  record(
    'the applied migration history is ordered and complete',
    applied.length === CANONICAL_MIGRATION_COUNT &&
      new Set(applied).size === CANONICAL_MIGRATION_COUNT,
    {
      count: applied.length,
      first: applied[0]?.slice(0, 12),
      last: applied.at(-1)?.slice(0, 12),
      serverVersion,
      fingerprintGate: CANONICAL_FINGERPRINT,
    },
  );

  const mutable = Object.fromEntries(
    MUTABLE_BASELINE_TABLES.map((table) => [table, sqlCount(`select count(*) from ${table}`)]),
  );
  record(
    'no catalog, evidence or identity row exists before the journey',
    Object.values(mutable).every((count) => count === 0),
    mutable,
  );
  record(
    'migration 0033 provisioned the four fixed categories, and nothing else was seeded',
    sqlCount("select count(*) from categories where status = 'PUBLISHED'") === 4 &&
      sqlCount('select count(*) from policy_configurations') === 0,
    {
      categories: sqlRows('select slug from categories order by slug'),
      policyConfigurations: 0,
    },
  );

  return { counts, applied: applied.length, serverVersion };
}

/**
 * The prerequisites, created independently of any other database.
 *
 * The staff identity goes through the API's own bootstrap CLI. The worker
 * runtime policy is published here because `APP2-I02` deliberately gives the
 * runtime no production default — a worker with no policy is a worker nobody
 * configured — so a freshly migrated database has none and something has to
 * author one. It is written the way the schema requires: a header row plus one
 * immutable version, with the header's pointer moved to it, authored by the
 * admin that exists.
 */
export function bootstrapPrerequisites({ record, staff }) {
  const bootstrap = bootstrapStaff({
    container: API_CONTAINER,
    email: staff.email,
    password: staff.password,
    displayName: staff.displayName,
  });
  record(
    'a synthetic staff identity was bootstrapped into the disposable database',
    {
      ok: bootstrap.status === 'CREATED' && bootstrap.accounts === 1,
    }.ok,
    { status: bootstrap.status, accounts: bootstrap.accounts },
  );

  const policy = workerPolicyStatements(bootstrap.adminId);
  for (const statement of policy.statements) sql(statement);

  const published = sqlCount(
    `select count(*) from policy_configurations pc
     join policy_configuration_versions v on v.id = pc.current_version_id
     where pc.config_key = '${WORKER_RUNTIME_POLICY_KEY}'`,
  );
  record(
    'the worker runtime policy was published as one immutable version',
    published === 1 && sqlCount('select count(*) from policy_configuration_versions') === 1,
    { key: WORKER_RUNTIME_POLICY_KEY, version: 1, value: WORKER_RUNTIME_POLICY },
  );

  return { staff: bootstrap, policy: { key: WORKER_RUNTIME_POLICY_KEY, version: 1 } };
}
