/**
 * Typed contracts for the worker claim/completion seam (ADR-APP2-002,
 * IMP-D029, APP2-DEC-JOBS-C1).
 *
 * Deliberately narrow: no Drizzle row escapes, no generic CRUD, and no way to
 * express a state transition the decision forbids. The worker cannot set
 * `FAILED`, cannot claim a `DEAD_LETTER` row and cannot complete a job it does
 * not currently hold, because none of those are representable here.
 */
import type { BackgroundJobKind } from './background-job-attempt-store';

/**
 * One event type the worker is able to handle, with the job kind its attempt
 * evidence is filed under.
 *
 * The pair travels together because the expired-lease evidence written during a
 * re-claim needs the job kind of an event the *claiming* worker has not seen
 * yet — it can only come from the registry, never from the row.
 */
export interface RegisteredJobType {
  readonly eventType: string;
  readonly jobKind: BackgroundJobKind;
}

export interface ClaimRegisteredBatchInput {
  readonly workerInstanceId: string;
  /** Empty means "handle nothing" — never "handle everything". */
  readonly registeredTypes: readonly RegisteredJobType[];
  readonly batchSize: number;
  readonly leaseDurationMs: number;
}

/**
 * A job this worker now holds a lease on.
 *
 * `attemptNo` is the post-increment `attempt_count`, so it is the attempt
 * number this execution must file its evidence under — the same value the
 * completion guard checks.
 */
export interface ClaimedWorkerJob {
  readonly outboxEventId: bigint;
  readonly eventType: string;
  readonly aggregateKind: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly payloadSchemaVersion: number;
  readonly attemptNo: number;
  readonly claimedAt: Date;
  readonly leaseExpiresAt: Date;
}

/** The identity every completion is guarded by. All four must still match. */
export interface CompletionGuard {
  readonly outboxEventId: bigint;
  readonly workerInstanceId: string;
  readonly attemptNo: number;
  readonly jobKind: BackgroundJobKind;
}

export interface RetryableCompletionInput extends CompletionGuard {
  readonly retryDelayMs: number;
  /** A stable class from the closed worker taxonomy. Never a raw message. */
  readonly errorClass: string;
}

export interface TerminalCompletionInput extends CompletionGuard {
  readonly errorClass: string;
}

/**
 * `STALE_JOB_LEASE` means the guard did not match: another worker owns the job
 * now, or this completion already ran. It is a normal outcome, not an error —
 * at-least-once delivery makes it reachable by design — and it must never
 * cause a second mutation.
 */
export type WorkerJobCompletion =
  { readonly outcome: 'COMPLETED' } | { readonly outcome: 'STALE_JOB_LEASE' };

/** The classification recorded when a lease is reclaimed after expiry. */
export const WORKER_LEASE_EXPIRED = 'WORKER_LEASE_EXPIRED';
