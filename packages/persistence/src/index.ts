/**
 * `@embroidery/persistence` — the NestJS persistence runtime (DB7).
 *
 * Owner: backend/persistence. Consumers: `@embroidery/api`, `@embroidery/worker`.
 *
 * Application and domain code may depend on the transaction abstraction and the
 * repository interfaces their own module declares. It must not import
 * `DatabaseExecutor`, `DatabaseConnection`, `pg` or Drizzle types — those are
 * infrastructure-only (`CLAUDE.md` §5, `BACKEND_CONVENTIONS.md` §3).
 */
export { DatabaseModule } from './database.module';

export { DATABASE_CONFIG, DATABASE_CONNECTION } from './runtime/database.tokens';
export { DatabaseConnection } from './runtime/database-connection';
export type { DatabaseExecutorHandle } from './runtime/database-executor';
export { DatabaseExecutor } from './runtime/database-executor';

export type { TransactionRunOptions } from './transaction/transaction-manager';
export { TransactionManager } from './transaction/transaction-manager';
export { transactionContext } from './transaction/transaction-context';

export { DrizzleRepository } from './repository/drizzle-repository';

// CTX-PLT platform primitives — narrow infrastructure ports, not CRUD APIs.
export type {
  IdempotencyClaim,
  IdempotencyKey,
  IdempotencyRecordSummary,
} from './platform/idempotency-store';
export { IdempotencyStore, isIdempotencyConflict } from './platform/idempotency-store';
export type {
  AllocationClaim,
  AllocationClaimInput,
  LockedIdempotencyRecord,
} from './platform/idempotency-allocation';
export { IdempotencyAllocationStore } from './platform/idempotency-allocation';

export type {
  AppendOutboxEventInput,
  ClaimedOutboxEvent,
  OutboxAggregateKind,
} from './platform/outbox-event-store';
export { OUTBOX_AGGREGATE_KINDS, OutboxEventStore } from './platform/outbox-event-store';

export type {
  BackgroundJobKind,
  JobAttemptRecord,
  RecordJobAttemptInput,
} from './platform/background-job-attempt-store';
export {
  BACKGROUND_JOB_KINDS,
  BackgroundJobAttemptStore,
} from './platform/background-job-attempt-store';

export type {
  ClaimRegisteredBatchInput,
  ClaimedWorkerJob,
  CompletionGuard,
  RegisteredJobType,
  RetryableCompletionInput,
  TerminalCompletionInput,
  WorkerJobCompletion,
} from './platform/worker-job-queue.types';
export { WORKER_LEASE_EXPIRED } from './platform/worker-job-queue.types';
export { WorkerJobQueueRepository } from './platform/worker-job-queue.repository';

export type {
  PolicyConfiguration,
  PolicyConfigurationVersion,
  PublishPolicyVersionInput,
} from './platform/policy-configuration.repository';
export { PolicyConfigurationRepository } from './platform/policy-configuration.repository';

export type { KeysetCursor, Page, PageRequest } from './query/keyset-cursor';
export {
  buildPage,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  encodeCursor,
  InvalidCursorError,
  MAX_PAGE_SIZE,
  resolveLimit,
} from './query/keyset-cursor';

export type {
  DatabaseHealth,
  DatabaseHealthReason,
  DatabaseHealthStatus,
} from './health/database-health.service';
export { DatabaseHealthService } from './health/database-health.service';
