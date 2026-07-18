/**
 * `pnpm db:migrate` — apply pending migrations (DB6 §9).
 *
 * Fails fast with a redacted message. A migration failure leaves the history
 * table showing exactly which migrations did apply, so the forward-fix
 * procedure in DB6_MIGRATION_GOVERNANCE.md starts from a known state.
 */
import { loadDatabaseConfig, redactUrl } from '../config/database-config';
import { runMigrations } from '../migrations/run-migrations';

async function main(): Promise<void> {
  const config = loadDatabaseConfig(process.env);
  console.log(`[db:migrate] applying migrations to ${redactUrl(config.url)}`);
  await runMigrations(config);
  console.log('[db:migrate] up to date');
}

main().catch((error: unknown) => {
  console.error(`[db:migrate] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
