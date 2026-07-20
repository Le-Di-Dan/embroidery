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

export type {
  PersistenceErrorDiagnostics,
  PersistenceErrorKind,
  PersistenceErrorOptions,
} from './errors/persistence-error';
export {
  guardViolationError,
  isPersistenceError,
  notFoundError,
  persistenceError,
  PersistenceError,
} from './errors/persistence-error';

export type { ConstraintMeaning } from './errors/constraint-catalog';
export { CATALOGUED_CONSTRAINTS, CONSTRAINT_MEANINGS } from './errors/constraint-catalog';

export { mapDatabaseError, withMappedErrors } from './errors/map-database-error';

export {
  isTransactionRequiredError,
  TransactionRequiredError,
} from './errors/transaction-required-error';

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

/**
 * Canonical lifecycle-state unions, re-exported as **types only**.
 *
 * DB5-A09 requires one canonical source per state set, and each schema module
 * already declares its states once as a `const` tuple that its CHECK
 * constraint, partial-index predicates and TypeScript union all derive from.
 * Re-declaring those unions in each backend module's domain layer would create
 * the second source DB5-A09 forbids, and a drifted copy would compile happily
 * against a database that rejects the value.
 *
 * Domain code imports these with `import type`, which erases at compile time —
 * no ORM value, table object or driver type enters a domain bundle, so
 * `BACKEND_CONVENTIONS.md` §3 ("domain must not import an ORM") holds. Domain
 * code must not import anything else from this package.
 */
export type {
  AdminAccountState,
  AdminSessionState,
  AssetClassification,
  AssetDerivativeKind,
  AssetDerivativeState,
  AssetInspectionOutcome,
  AssetKind,
  AssetState,
  AgreementVersionState,
  CategoryState,
  ContactKind,
  ContentPageState,
  ContentPageType,
  CustomRequestState,
  DesignReviewOutcome,
  DesignVersionState,
  GrantScopeKind,
  IdempotencyRecordState,
  InventoryEntryKind,
  InventoryReservationState,
  InventorySoftHoldState,
  GalleryEntryState,
  JobAttemptOutcome,
  OutboxEventState,
  OrderState,
  PaymentAttemptState,
  PaymentObligationKind,
  PaymentObligationState,
  PaymentProviderEventOutcome,
  ProductMediaRole,
  QuotationLineKind,
  QuotationState,
  QuotationVersionState,
  ProductState,
  RedirectKind,
  RefundState,
  SecureAccessGrantState,
  ShippingDetailState,
  VerificationAttemptOutcome,
  VerificationChallengeState,
  VerificationPurpose,
} from './schema/index';
