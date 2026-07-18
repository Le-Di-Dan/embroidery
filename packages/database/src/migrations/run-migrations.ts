/**
 * Migration runner (ADR-DB1-003, DB6-S03).
 *
 * Forward-only. Migrations are generated, reviewed by a human, committed, and
 * then immutable once shared. There is no down-migration path: recovery from a
 * bad migration is a new forward migration, not a reversal.
 */
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { DatabaseConfig } from '../config/database-config';
import { createDatabaseClient } from '../client/create-database-client';
import { assertDatabaseBaseline } from '../client/assert-database-baseline';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url));
export const MIGRATIONS_SCHEMA = 'drizzle';
export const MIGRATIONS_TABLE = '__drizzle_migrations';

/**
 * Applies every pending migration.
 *
 * The baseline assertion runs first, on purpose: applying a schema to a
 * database with the wrong collation or major version would "succeed" and leave
 * a subtly wrong database behind.
 */
export async function runMigrations(config: DatabaseConfig): Promise<void> {
  const client = createDatabaseClient(config);
  try {
    await assertDatabaseBaseline(client.db, config.expectedMajorVersion);
    await migrate(client.db, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
  } finally {
    await client.close();
  }
}
