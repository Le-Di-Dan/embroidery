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

// ---------------------------------------------------------------------------
// Shared aggregate persistence (APP7-W01-C1).
//
// AGG-15 Order and AGG-16 Payment are the only aggregates **two applications
// write**: the API owns the request, quotation and design paths, and the worker
// converts an approval into an order with both obligations. Everything else in
// this package is a platform primitive; these two are here because a second
// implementation of GRD-009 or of the obligation pair would be free to disagree
// with the first, and no constraint in the schema would catch it (INV-19).
//
// Delivered DB7 behaviour is unchanged — the files moved, the semantics did not.
// ---------------------------------------------------------------------------

export type { CustomRequestId, RequestActor } from './order/ordering-identity';
export type {
  AcknowledgeShippingFeeInput,
  CreateOrderInput,
  Order,
  OrderId,
  OrderItem,
  OrderRepository,
  OrderTransition,
  SaveShippingDetailInput,
  ShippingDetail,
  TransitionOrderInput,
} from './order/order.repository';
export { ORDER_REPOSITORY } from './order/order.repository';
export { DISPATCHABLE_FROM, isLegalOrderTransition } from './order/order-transitions';
export type { OrderChain } from './order/order-chain.guard';
export { OrderChainGuard } from './order/order-chain.guard';
export { DrizzleOrderRepository } from './order/drizzle-order.repository';
export { DrizzleOrderShippingRepository } from './order/drizzle-order-shipping.repository';
export { OrderPersistenceModule } from './order/order-persistence.module';

export type {
  AttemptId,
  CreateObligationInput,
  ObligationId,
  OpenAttemptInput,
  PaymentAttempt,
  PaymentObligation,
  PaymentObligationRepository,
  ProviderEventOutcome,
  RecordProviderEventInput,
  Refund,
  RefundId,
  VerifiableAttempt,
} from './payment/payment-obligation.repository';
export { PAYMENT_OBLIGATION_REPOSITORY } from './payment/payment-obligation.repository';
export type { DepositEligibilityPort } from './payment/deposit-eligibility.port';
export { DEPOSIT_ELIGIBILITY_PORT } from './payment/deposit-eligibility.port';
export { PaymentAttemptRepository } from './payment/payment-attempt.repository';
export { PaymentEvidenceRepository } from './payment/payment-evidence.repository';
export { PaymentTransferEvidenceRepository } from './payment/payment-transfer-evidence.repository';
export type {
  BindTransferEvidenceInput,
  BoundTransferEvidence,
  LockedEvidenceAttempt,
  TransferEvidenceAssociation,
  TransferEvidenceId,
} from './payment/payment-transfer-evidence.repository';
export { DrizzlePaymentObligationRepository } from './payment/drizzle-payment-obligation.repository';
export { DrizzleDepositEligibilityAdapter } from './payment/drizzle-deposit-eligibility.adapter';
export { PaymentPersistenceModule } from './payment/payment-persistence.module';
