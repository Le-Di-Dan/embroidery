/**
 * Connection factory for the persistence layer (DB6-S03).
 *
 * This is the only place a `pg` Pool is constructed. Domain and application
 * code receive the typed handle, never the driver (ADR-DB1-002/009).
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { DatabaseConfig } from '../config/database-config';
import { redactUrl } from '../config/database-config';
import * as schema from '../schema/index';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClient {
  readonly db: Database;
  readonly pool: Pool;
  close(): Promise<void>;
}

function resolveSsl(config: DatabaseConfig): false | { rejectUnauthorized: boolean } {
  switch (config.sslMode) {
    case 'disable':
      return false;
    case 'require':
      // Encrypt, but do not verify the chain — acceptable only inside a trusted
      // network boundary. `verify-full` is the production-grade setting.
      return { rejectUnauthorized: false };
    case 'verify-full':
      return { rejectUnauthorized: true };
  }
}

export function createDatabaseClient(config: DatabaseConfig): DatabaseClient {
  const pool = new Pool({
    connectionString: config.url,
    max: config.poolMax,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    ssl: resolveSsl(config),
    // Applied per connection, so every session inherits the guards rather than
    // relying on each call site to set them. lock_timeout keeps a contended row
    // lock from parking a request indefinitely; it surfaces as SQLSTATE 55P03.
    options: `-c statement_timeout=${config.statementTimeoutMs} -c lock_timeout=${config.lockTimeoutMs}`,
  });

  pool.on('error', (error: Error) => {
    // An idle-client error must not take the process down, but it must be
    // visible. The URL is redacted: pool errors are a common credential leak.
    console.error(`[database] idle client error for ${redactUrl(config.url)}: ${error.message}`);
  });

  const db = drizzle(pool, { schema, casing: 'snake_case' });

  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}
