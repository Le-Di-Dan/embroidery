/**
 * `pnpm db:status` — report schema/migration state and drift (DB6 §19).
 *
 * Exit code 0 only when the database matches the repository. Anything else —
 * pending, uninitialised, ahead, or checksum mismatch — exits non-zero so CI
 * and local scripts cannot proceed against a database that does not match the
 * schema the code was written for.
 */
import { loadDatabaseConfig, redactUrl } from '../config/database-config';
import { createDatabaseClient } from '../client/create-database-client';
import {
  readDatabaseBaseline,
  describeBaselineMismatches,
} from '../client/assert-database-baseline';
import { readSchemaStatus } from '../migrations/schema-status';

const GUIDANCE: Record<string, string> = {
  'up-to-date': 'Nothing to do.',
  pending: 'Run `pnpm db:migrate` to apply them.',
  uninitialised:
    'No migration history. Start the database (`pnpm docker:dev:up postgres`) then run `pnpm db:migrate`.',
  'ahead-of-repository':
    'This database was migrated on a branch with more migrations. Switch back to that branch, or reset the local volume with `pnpm db:reset` (destroys local data).',
  'checksum-mismatch':
    'An applied migration file was edited. Restore it, or reset the local volume with `pnpm db:reset`. Never edit a shared migration.',
};

async function main(): Promise<void> {
  const config = loadDatabaseConfig(process.env);
  const client = createDatabaseClient(config);

  try {
    const baseline = await readDatabaseBaseline(client.db);
    const baselineProblems = describeBaselineMismatches(baseline, config.expectedMajorVersion);

    console.log(`[db:status] target      ${redactUrl(config.url)}`);
    console.log(`[db:status] server      PostgreSQL ${baseline.serverVersion}`);
    console.log(
      `[db:status] baseline    encoding=${baseline.encoding} collate=${baseline.collate} tz=${baseline.timeZone}`,
    );

    const status = await readSchemaStatus(client.db);
    console.log(
      `[db:status] migrations  ${status.appliedMigrations} applied / ${status.repositoryMigrations} in repository`,
    );
    console.log(`[db:status] state       ${status.code}`);

    for (const file of status.pending) {
      console.log(`[db:status]   pending: ${file}`);
    }
    for (const problem of [...baselineProblems, ...status.problems]) {
      console.error(`[db:status]   PROBLEM: ${problem}`);
    }

    const guidance = GUIDANCE[status.code];
    if (guidance !== undefined) {
      console.log(`[db:status] ${guidance}`);
    }

    const healthy = status.code === 'up-to-date' && baselineProblems.length === 0;
    process.exitCode = healthy ? 0 : 1;
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(`[db:status] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
