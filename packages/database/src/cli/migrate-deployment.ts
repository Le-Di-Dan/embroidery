/**
 * The deployment migration entrypoint (`APP12-H02` §10).
 *
 * ## Why a second entrypoint exists
 *
 * `migrate.ts` beside this file is the *developer* entrypoint: ESM, resolving
 * its own location through `import.meta.url`, and run by `tsx` straight from
 * TypeScript source. That shape is deliberate and stays — but it is unreachable
 * from a production image, for two independent reasons found while building the
 * `APP12-H02` deployment model:
 *
 * 1. `tsconfig.build.json` excludes `src/cli/migrate.ts` from the compiled
 *    output, because `import.meta.url` cannot be emitted under CommonJS. The
 *    shipped `dist/cli` was therefore empty.
 * 2. The API runner image ships `packages/database/dist` and nothing else from
 *    this package, so the `.sql` files in `packages/database/migrations` — the
 *    actual migration history — were not in the image at all.
 *
 * A deployment whose migration step cannot run is a deployment that cannot
 * release, so both are fixed: this module compiles (it resolves its location
 * from `__dirname`, which CommonJS has), and `infrastructure/docker/api.Dockerfile`
 * now copies the migrations directory into the runner.
 *
 * ## What it does not do
 *
 * Nothing new. It is a thin argument-free wrapper over the same `runMigrations`
 * the developer CLI calls, against the same directory, with the same
 * forward-only semantics and the same baseline assertion. Two entrypoints that
 * applied migrations *differently* would be two schema histories; these two
 * differ only in how they locate themselves.
 *
 * Re-running it against an already-current database is a no-op: the runner
 * records what it applied in `drizzle.__drizzle_migrations` and applies only
 * what is missing.
 */
import { join } from 'node:path';

import { loadDatabaseConfig, redactUrl } from '../config/database-config';
import { migrationsFolderFrom, runMigrations } from '../migrations/run-migrations';

/**
 * This module is emitted to `dist/cli/`, so the package root is two levels up.
 * Resolved from `__dirname` rather than the working directory: a Kubernetes Job
 * sets no `workingDir`, and a relative path would resolve against `/`.
 */
const PACKAGE_JSON = join(__dirname, '..', '..', 'package.json');

async function main(): Promise<void> {
  const config = loadDatabaseConfig(process.env);
  // The URL is redacted before it is printed. It embeds the database password,
  // and a deployment log is the one place a credential is hardest to recall.
  console.log(`[db:migrate] applying migrations to ${redactUrl(config.url)}`);
  await runMigrations(config, migrationsFolderFrom(PACKAGE_JSON));
  console.log('[db:migrate] up to date');
}

main().catch((error: unknown) => {
  console.error(`[db:migrate] failed: ${error instanceof Error ? error.message : String(error)}`);
  // A non-zero exit is what makes the Kubernetes Job fail and the release stop.
  // `exitCode` rather than `process.exit` so the stream flushes first — a
  // truncated failure message is the one log line that must survive.
  process.exitCode = 1;
});
