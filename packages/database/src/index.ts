/**
 * `@embroidery/database` — physical schema, migrations and persistence
 * foundation (DB6).
 *
 * This package owns the schema source of truth, the migration history and the
 * connection/transaction primitives. It deliberately contains **no** feature
 * repositories, business services or queries: those belong to the owning
 * backend module (BACKEND_CONVENTIONS §9, ADR-DB1-009).
 */
export type {
  DatabaseConfig,
  DatabaseEnvironment,
  DatabaseSslMode,
} from './config/database-config';
export { loadDatabaseConfig, redactUrl } from './config/database-config';

export type { Database, DatabaseClient } from './client/create-database-client';
export { createDatabaseClient } from './client/create-database-client';

export type { DatabaseBaseline } from './client/assert-database-baseline';
export {
  assertDatabaseBaseline,
  describeBaselineMismatches,
  readDatabaseBaseline,
} from './client/assert-database-baseline';

export type {
  IsolationLevel,
  SqlState,
  Transaction,
  TransactionOptions,
} from './client/transaction';
export { isSqlState, SQLSTATE, withTransaction } from './client/transaction';

export type { SqlExecutor } from './client/raw-sql';
export { executeRaw, sql } from './client/raw-sql';

export type { DriverError } from './errors/driver-error';
export { driverErrorCode, extractDriverError } from './errors/driver-error';

export { newId } from './primitives/identifiers';

export type { SchemaStatus, SchemaStatusCode } from './migrations/schema-status';
export { readSchemaStatus } from './migrations/schema-status';
export {
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
  migrationsFolderFrom,
  runMigrations,
} from './migrations/run-migrations';

export * as schema from './schema/index';
