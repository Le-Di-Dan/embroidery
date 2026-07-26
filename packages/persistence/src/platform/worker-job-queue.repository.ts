/**
 * The atomic queue primitives behind the PostgreSQL job runtime
 * (ADR-APP2-002 / IMP-D029, corrected by APP2-DEC-JOBS-C1).
 *
 * `outbox_events` *is* the queue row and `background_job_attempts` is the
 * append-only attempt ledger; there is no separate jobs table and no broker.
 * Everything here is one statement or one transaction, because the properties
 * that make at-least-once delivery safe — a lease nobody else can steal,
 * evidence that cannot be lost, a completion that cannot run twice — are all
 * atomicity properties. Splitting any of them into two round trips would
 * reintroduce exactly the races the design exists to prevent.
 *
 * Why this sits beside {@link OutboxEventStore} rather than inside it: that
 * store is the DB7-era producer/dispatcher primitive and still emits `FAILED`,
 * a status APP2 must never write. Widening it would put two contradictory
 * lifecycles in one class.
 *
 * ### The three PENDING sub-states
 *
 * `PENDING` is the only automatically claimable status (IDX-088 indexes exactly
 * that predicate). `claimed_by` disambiguates what `next_attempt_at` means:
 *
 * | claimed_by | next_attempt_at | meaning                    |
 * |------------|-----------------|----------------------------|
 * | NULL       | NULL            | fresh, due now             |
 * | NULL       | future          | retry backoff              |
 * | set        | future          | active lease, expires then |
 * | set        | past            | expired lease, reclaimable |
 *
 * No lease column is added: the pair already carries the state, and a fourth
 * column could disagree with it.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import { assertKnownJobKind } from './background-job-attempt-store';
import type {
  ClaimRegisteredBatchInput,
  ClaimedWorkerJob,
  CompletionGuard,
  RetryableCompletionInput,
  TerminalCompletionInput,
  WorkerJobCompletion,
} from './worker-job-queue.types';
import { WORKER_LEASE_EXPIRED } from './worker-job-queue.types';

const { backgroundJobAttempts } = schema;

/** Bounds one claim so a single worker cannot monopolise the queue. */
const MAX_CLAIM_BATCH = 100;

const COMPLETED: WorkerJobCompletion = { outcome: 'COMPLETED' };
const STALE: WorkerJobCompletion = { outcome: 'STALE_JOB_LEASE' };

@Injectable()
export class WorkerJobQueueRepository extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Claims due events whose type the caller can actually handle.
   *
   * The filter is not an optimisation. An unregistered event claimed by this
   * worker would be leased, executed by nothing, and eventually dead-lettered —
   * so a worker that does not know an event type must leave the row untouched
   * for a deployment that does.
   *
   * @requiresTransaction — `FOR UPDATE SKIP LOCKED` holds only inside one.
   */
  async claimRegisteredBatch(input: ClaimRegisteredBatchInput): Promise<ClaimedWorkerJob[]> {
    return this.run('claimRegisteredBatch', async () => {
      const tx = this.requireTransaction('claimRegisteredBatch');

      // An empty registry claims nothing and issues no query. Falling through
      // would produce `event_type = ANY('{}')`, which is merely *currently*
      // harmless; an empty IN-list is one refactor away from a claim-all.
      if (input.registeredTypes.length === 0) {
        return [];
      }

      for (const registered of input.registeredTypes) {
        assertKnownJobKind(registered.jobKind);
      }
      // One JSONB scalar rather than two text arrays: a JS array inside a
      // Drizzle `sql` template expands into separate placeholders, which does
      // not produce a PostgreSQL array. Sending the pairs as a single
      // parameter also keeps event type and job kind aligned by construction.
      const registeredJson = JSON.stringify(
        input.registeredTypes.map((registered) => ({
          event_type: registered.eventType,
          job_kind: registered.jobKind,
        })),
      );

      const batchSize = Math.min(Math.max(Math.trunc(input.batchSize), 1), MAX_CLAIM_BATCH);
      const leaseSeconds = input.leaseDurationMs / 1_000;

      // One statement, so `now()` is a single database instant for the whole
      // claim and no clock on any worker host can influence due-ness or lease
      // expiry. The data-modifying `evidence` CTE is guaranteed by PostgreSQL
      // to run exactly once and to completion, whether or not its output is
      // read — which is why the attempt row cannot be skipped.
      const result = await tx.execute(sql`
        WITH registered AS (
          SELECT r.event_type, r.job_kind
          FROM jsonb_to_recordset(${registeredJson}::jsonb)
            AS r(event_type text, job_kind text)
        ),
        due AS (
          SELECT o.id
          FROM outbox_events o
          WHERE o.status = 'PENDING'
            AND o.event_type IN (SELECT event_type FROM registered)
            AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= now())
          ORDER BY o.next_attempt_at NULLS FIRST, o.id
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        ),
        expired AS (
          SELECT o.id, o.attempt_count, r.job_kind
          FROM outbox_events o
          JOIN due d ON d.id = o.id
          JOIN registered r ON r.event_type = o.event_type
          WHERE o.claimed_by IS NOT NULL
        ),
        evidence AS (
          INSERT INTO background_job_attempts
            (job_kind, job_key, attempt_no, outcome, is_dead_letter, error_class, finished_at)
          SELECT e.job_kind, e.id::text, e.attempt_count,
                 'FAILED_RETRYABLE', false, ${WORKER_LEASE_EXPIRED}, now()
          FROM expired e
          ON CONFLICT (job_kind, job_key, attempt_no) DO NOTHING
          RETURNING 1
        ),
        claimed AS (
          UPDATE outbox_events o
          SET attempt_count = o.attempt_count + 1,
              claimed_by = ${input.workerInstanceId},
              claimed_at = now(),
              next_attempt_at = now() + make_interval(secs => ${leaseSeconds}::double precision)
          FROM due d
          WHERE o.id = d.id
          RETURNING o.id, o.event_type, o.aggregate_kind, o.aggregate_id, o.payload,
                    o.payload_schema_version, o.attempt_count, o.claimed_at, o.next_attempt_at
        )
        SELECT * FROM claimed ORDER BY id
      `);

      return rowsOf(result).map(toClaimedJob);
    });
  }

  /**
   * Records success and marks the event dispatched, atomically.
   *
   * @requiresTransaction
   */
  async completeSucceededAttempt(input: CompletionGuard): Promise<WorkerJobCompletion> {
    return this.run('completeSucceededAttempt', () =>
      this.complete(input, 'SUCCEEDED', undefined, {
        status: sql`'DISPATCHED'`,
        dispatchedAt: sql`now()`,
        nextAttemptAt: sql`NULL`,
        lastError: sql`NULL`,
      }),
    );
  }

  /**
   * Records a retryable failure and re-arms the event for a later attempt.
   *
   * The status stays `PENDING`, never `FAILED`: `PENDING` is the only status
   * IDX-088 indexes for claiming, so a `FAILED` row would silently never be
   * retried — the correction APP2-DEC-JOBS-C1 exists to prevent.
   *
   * @requiresTransaction
   */
  async completeRetryableAttempt(input: RetryableCompletionInput): Promise<WorkerJobCompletion> {
    const retrySeconds = input.retryDelayMs / 1_000;
    return this.run('completeRetryableAttempt', () =>
      this.complete(input, 'FAILED_RETRYABLE', input.errorClass, {
        status: sql`'PENDING'`,
        dispatchedAt: sql`NULL`,
        nextAttemptAt: sql`now() + make_interval(secs => ${retrySeconds}::double precision)`,
        lastError: sql`${input.errorClass}`,
      }),
    );
  }

  /**
   * Records a terminal failure and dead-letters the event.
   *
   * `DEAD_LETTER` is outside the claim predicate, so the row is never picked up
   * again automatically — it waits for an operator.
   *
   * @requiresTransaction
   */
  async completeTerminalAttempt(input: TerminalCompletionInput): Promise<WorkerJobCompletion> {
    return this.run('completeTerminalAttempt', () =>
      this.complete(input, 'FAILED_TERMINAL', input.errorClass, {
        status: sql`'DEAD_LETTER'`,
        dispatchedAt: sql`NULL`,
        nextAttemptAt: sql`NULL`,
        lastError: sql`${input.errorClass}`,
      }),
    );
  }

  /**
   * Liveness of this worker's own pool, as a boolean for readiness.
   *
   * Swallows the driver error on purpose: readiness must report "not ready",
   * never crash the process, and the reason belongs in the health service that
   * already classifies it without leaking a connection string.
   */
  async probeWorkerDatabase(): Promise<boolean> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The shared completion body: guarded update first, evidence second.
   *
   * The guard (`id` + `PENDING` + this worker + this attempt) is what makes the
   * whole runtime safe under at-least-once delivery. Zero updated rows means
   * someone else owns the job now — so the attempt row is never written either,
   * and the ledger keeps exactly one row per real attempt.
   */
  private async complete(
    guard: CompletionGuard,
    outcome: 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL',
    errorClass: string | undefined,
    changes: OutboxChanges,
  ): Promise<WorkerJobCompletion> {
    const tx = this.requireTransaction('complete');
    assertKnownJobKind(guard.jobKind);

    const updated = await tx.execute(sql`
      UPDATE outbox_events
      SET status = ${changes.status},
          next_attempt_at = ${changes.nextAttemptAt},
          dispatched_at = ${changes.dispatchedAt},
          claimed_by = NULL,
          claimed_at = NULL,
          last_error = ${changes.lastError}
      WHERE id = ${guard.outboxEventId}
        AND status = 'PENDING'
        AND claimed_by = ${guard.workerInstanceId}
        AND attempt_count = ${guard.attemptNo}
      RETURNING id
    `);

    if (rowsOf(updated).length === 0) {
      return STALE;
    }

    await tx.insert(backgroundJobAttempts).values({
      jobKind: guard.jobKind,
      jobKey: guard.outboxEventId.toString(),
      attemptNo: guard.attemptNo,
      outcome,
      isDeadLetter: outcome === 'FAILED_TERMINAL',
      errorClass: errorClass ?? null,
      finishedAt: new Date(),
    });

    return COMPLETED;
  }
}

interface OutboxChanges {
  readonly status: ReturnType<typeof sql>;
  readonly nextAttemptAt: ReturnType<typeof sql>;
  readonly lastError: ReturnType<typeof sql>;
  readonly dispatchedAt: ReturnType<typeof sql>;
}

/**
 * Normalises a driver result to rows.
 *
 * `execute` returns the driver's own result object, whose shape differs between
 * a pooled handle and a transaction handle in some drivers; reading `rows`
 * defensively costs nothing and avoids a runtime surprise.
 */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const { rows } = result as { rows?: unknown };
    if (Array.isArray(rows)) {
      return rows as Record<string, unknown>[];
    }
  }
  return [];
}

/**
 * `outbox_events.id` is `bigint`, which node-postgres returns as a string to
 * avoid a silent precision loss above 2^53. The domain type is `bigint`, so the
 * conversion happens here once rather than in every caller.
 */
function toClaimedJob(row: Record<string, unknown>): ClaimedWorkerJob {
  return {
    outboxEventId: BigInt(String(row['id'])),
    eventType: String(row['event_type']),
    aggregateKind: String(row['aggregate_kind']),
    aggregateId: String(row['aggregate_id']),
    payload: row['payload'],
    payloadSchemaVersion: Number(row['payload_schema_version']),
    attemptNo: Number(row['attempt_count']),
    claimedAt: toDate(row['claimed_at']),
    leaseExpiresAt: toDate(row['next_attempt_at']),
  };
}

/** `timestamptz` arrives as a `Date`; parse defensively rather than assume. */
function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}
