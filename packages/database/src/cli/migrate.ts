/**
 * `pnpm db:migrate` — apply pending migrations (DB6 §9).
 *
 * Fails fast with a redacted message. A migration failure leaves the history
 * table showing exactly which migrations did apply, so the forward-fix
 * procedure in DB6_MIGRATION_GOVERNANCE.md starts from a known state.
 */
import { fileURLToPath } from 'node:url';

import { loadDatabaseConfig, redactUrl } from '../config/database-config';
import { migrationsFolderFrom, runMigrations } from '../migrations/run-migrations';

/** This CLI is ESM (run through `tsx`), so it resolves the path itself. */
const PACKAGE_JSON = fileURLToPath(new URL('../../package.json', import.meta.url));

async function main(): Promise<void> {
  const config = loadDatabaseConfig(process.env);
  console.log(`[db:migrate] applying migrations to ${redactUrl(config.url)}`);
  await runMigrations(config, migrationsFolderFrom(PACKAGE_JSON));
  console.log('[db:migrate] up to date');
}

main().catch((error: unknown) => {
  console.error(`[db:migrate] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
