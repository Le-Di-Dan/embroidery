/**
 * `@embroidery/database/testing` — integration-test harness (DB7).
 *
 * Exported from a separate entry point so nothing in the application runtime
 * can import a test helper by accident.
 */
export type { DisposableDatabase } from './disposable-database';
export { createDisposableDatabase, disposableDatabaseName } from './disposable-database';

export { truncateAllTables } from './reset-database';

export { verifySchemaBaseline } from './verify-schema-baseline';
export type { SchemaBaselineResult } from './verify-schema-baseline';

export { findWorkspaceRoot, migrationsFolder, resolveDatabaseUrl } from './workspace-paths';
