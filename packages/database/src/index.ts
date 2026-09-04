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
 * Canonical catalog **locked draft defaults and lifecycle values** (IMP-D032),
 * re-exported as values.
 *
 * These are the narrow exception to the types-only rule below. They are plain
 * frozen data: no table object, ORM value or driver type is reachable through
 * them, so a domain module may import them without pulling the schema namespace
 * in (`BACKEND_CONVENTIONS.md` §3).
 *
 * `APP2_CATEGORY_STATUS` is the one category constant that remains, and it is a
 * **status**, not a category: the lifecycle has no `ACTIVE` literal, so
 * "publicly visible" maps onto `PUBLISHED`. Status vocabulary is code; category
 * values are data.
 *
 * `APP2_CATEGORY_SLUGS` and `APP2_CATEGORY_TAXONOMY` deliberately no longer
 * cross this boundary (`APP12-C01-C1`, `IMP-D062`). They were the second,
 * compiled-in category authority; the `categories` table is the only one now,
 * and the historical values survive as test-only fixture data in
 * `schema/catalog/__historical__/app2-category-fixture.ts`.
 */
export { APP2_CATEGORY_STATUS } from './schema/catalog/categories';
export {
  PRODUCT_DRAFT_BASE_PRICE_AMOUNT,
  PRODUCT_DRAFT_DISPLAY_ORDER,
} from './schema/catalog/products';
export {
  APP2_PRODUCT_MEDIA_ROLES,
  PRODUCT_MEDIA_PRIMARY_ROLE,
  PRODUCT_MEDIA_SECONDARY_ROLE,
} from './schema/catalog/product-media';
/**
 * The closed reconciliation-action set (`APP7-B04`), on the same terms.
 *
 * `ck_payment_reconciliations__action_allowed` is generated from this tuple, so
 * an Admin verification that picked its action from a literal in the payment
 * module would be the second source DB5-A09 forbids — and the drift would only
 * surface as a sanitised CHECK violation on a money write. It is plain frozen
 * data: no table object or driver type is reachable through it.
 */
export { PAYMENT_RECONCILIATION_ACTIONS } from './schema/payment/payment-reconciliations';

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
  CustomerMergeCaseState,
  CustomOrderState,
  CustomRequestState,
  DesignReviewOutcome,
  DesignSessionState,
  DesignTemplateState,
  DesignVersionState,
  GrantScopeKind,
  IdempotencyRecordState,
  InventoryEntryKind,
  InventoryReservationState,
  InventorySoftHoldState,
  GalleryEntryState,
  JobAttemptOutcome,
  MergeEventStepKind,
  OutboxEventState,
  NotificationDeliveryOutcome,
  NotificationIntentState,
  OrderOrigin,
  OrderState,
  PaymentAttemptState,
  PaymentObligationKind,
  PaymentObligationState,
  PaymentProviderEventOutcome,
  PaymentReconciliationAction,
  ProductMediaRole,
  ProductionArtifactKind,
  ProductionJobState,
  QuotationLineKind,
  QuotationState,
  QuotationVersionState,
  ProductState,
  ReadyMadeOrderState,
  RedirectKind,
  RefundState,
  SecureAccessGrantState,
  ShippingDetailState,
  VerificationAttemptOutcome,
  VerificationChallengeState,
  VerificationPurpose,
} from './schema/index';

// APP4-B01-C1 — the G01 policy dataset reader. The JSON in `seed/` stays the
// single value source; this exposes it without restating a number.
export {
  APP4_POLICY_DATASET_FILE,
  APP4_POLICY_KEYS,
  loadApp4PolicyDataset,
  seedFolderFrom,
} from './seed/app4-policy-dataset';
export type {
  App4PolicyConfiguration,
  App4PolicyDataset,
  App4PolicyKey,
} from './seed/app4-policy-dataset';

// APP6-B01 — the G01 policy dataset reader. Same rule as the APP4 one above:
// the JSON in `seed/` stays the single value source, and nothing here restates
// a validity window, a deposit share or an agreement type.
export {
  APP6_POLICY_DATASET_FILE,
  APP6_POLICY_KEYS,
  loadApp6PolicyDataset,
} from './seed/app6-policy-dataset';
export type {
  App6PolicyConfiguration,
  App6PolicyDataset,
  App6PolicyKey,
} from './seed/app6-policy-dataset';

// APP6-B10 — the G01-C1 agreement-content dataset reader. Same rule again: the
// JSON in `seed/` stays the single content source, and nothing here restates a
// sentence, a policy name or the required type set.
export {
  APP6_AGREEMENT_CONTENT_DATASET_FILE,
  APP6_AGREEMENT_CONTENT_TYPES,
  loadApp6AgreementContentDataset,
} from './seed/app6-agreement-content-dataset';
export type {
  App6AgreementContent,
  App6AgreementContentDataset,
  App6AgreementContentType,
} from './seed/app6-agreement-content-dataset';

// APP12-H03-C1 — the `worker.runtime` dataset reader. The third dataset on the
// same rule, and the one that closes the gap `APP12-H03` found in a cold
// cluster: the policy the worker has read since APP2-I02 had no publisher, so a
// freshly deployed worker stayed idle. The JSON in `seed/` is the single value
// source and nothing here restates a lease, a timeout or an attempt budget.
export {
  WORKER_RUNTIME_POLICY_DATASET_FILE,
  WORKER_RUNTIME_POLICY_DATASET_KEY,
  loadWorkerRuntimePolicyDataset,
} from './seed/worker-runtime-policy-dataset';
export type {
  WorkerRuntimePolicyConfiguration,
  WorkerRuntimePolicyDataset,
} from './seed/worker-runtime-policy-dataset';
