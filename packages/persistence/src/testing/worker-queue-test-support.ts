/**
 * Fixtures for the APP2-I02 worker-queue integration suites.
 *
 * Rows are written with raw SQL rather than through `OutboxEventStore.append`
 * on purpose: the suite has to *construct* states the producer can never
 * produce — an expired lease, a row already held by another worker, a
 * dead-lettered row — and going through the producer could only ever set up
 * the happy state.
 *
 * Test-only. Build-excluded via `src/testing/**`.
 */
import { sql } from 'drizzle-orm';
import type { DisposableDatabase } from '@embroidery/database/testing';

/**
 * Synthetic event types. Deliberately not a real domain event: I02 ships no
 * production handler, and a suite that used a real type could make a future
 * handler look registered when it is not.
 */
export const SYNTHETIC_EVENT_ALPHA = 'app2.i02.synthetic.alpha';
export const SYNTHETIC_EVENT_BETA = 'app2.i02.synthetic.beta';
export const SYNTHETIC_JOB_KIND = 'OUTBOX_DISPATCH' as const;

export interface SeedOutboxEventInput {
  readonly eventType?: string;
  readonly status?: string;
  readonly attemptCount?: number;
  /** Seconds relative to database `now()`; `null` writes SQL NULL. */
  readonly nextAttemptOffsetSeconds?: number | null;
  readonly claimedBy?: string | null;
  readonly payload?: Record<string, unknown>;
  readonly payloadSchemaVersion?: number;
}

export interface OutboxRowSnapshot {
  readonly id: bigint;
  readonly eventType: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly nextAttemptAt: Date | null;
  readonly claimedBy: string | null;
  readonly claimedAt: Date | null;
  readonly dispatchedAt: Date | null;
  readonly lastError: string | null;
  readonly payload: unknown;
  readonly aggregateId: string;
}

export interface AttemptRowSnapshot {
  readonly jobKind: string;
  readonly jobKey: string;
  readonly attemptNo: number;
  readonly outcome: string;
  readonly isDeadLetter: boolean;
  readonly errorClass: string | null;
}

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

/** Inserts one outbox row in an exactly specified state and returns its id. */
export async function seedOutboxEvent(
  disposable: DisposableDatabase,
  input: SeedOutboxEventInput = {},
): Promise<bigint> {
  const offset = input.nextAttemptOffsetSeconds;
  const nextAttempt =
    offset === null
      ? sql`NULL`
      : sql`now() + make_interval(secs => ${offset ?? 0}::double precision)`;

  const result = await disposable.client.db.execute(sql`
    INSERT INTO outbox_events
      (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
       status, attempt_count, next_attempt_at, claimed_by, claimed_at)
    VALUES (
      ${input.eventType ?? SYNTHETIC_EVENT_ALPHA},
      'CUSTOM_REQUEST',
      ${`agg-${String(Math.trunc(performance.now() * 1000))}`},
      ${JSON.stringify(input.payload ?? { marker: 'i02' })}::jsonb,
      ${input.payloadSchemaVersion ?? 1},
      ${input.status ?? 'PENDING'},
      ${input.attemptCount ?? 0},
      ${nextAttempt},
      ${input.claimedBy ?? null},
      ${input.claimedBy === undefined || input.claimedBy === null ? sql`NULL` : sql`now()`}
    )
    RETURNING id
  `);

  const [row] = rowsOf(result);
  if (row === undefined) {
    throw new Error('Seeding an outbox event returned no row.');
  }
  return BigInt(String(row['id']));
}

export async function readOutboxRow(
  disposable: DisposableDatabase,
  id: bigint,
): Promise<OutboxRowSnapshot> {
  const result = await disposable.client.db.execute(sql`
    SELECT id, event_type, status, attempt_count, next_attempt_at, claimed_by,
           claimed_at, dispatched_at, last_error, payload, aggregate_id
    FROM outbox_events WHERE id = ${id}
  `);
  const [row] = rowsOf(result);
  if (row === undefined) {
    throw new Error(`Outbox row ${String(id)} does not exist.`);
  }
  return {
    id: BigInt(String(row['id'])),
    eventType: String(row['event_type']),
    status: String(row['status']),
    attemptCount: Number(row['attempt_count']),
    nextAttemptAt: asDate(row['next_attempt_at']),
    claimedBy: asText(row['claimed_by']),
    claimedAt: asDate(row['claimed_at']),
    dispatchedAt: asDate(row['dispatched_at']),
    lastError: asText(row['last_error']),
    payload: row['payload'],
    aggregateId: String(row['aggregate_id']),
  };
}

export async function readAttempts(
  disposable: DisposableDatabase,
  jobKey: bigint,
): Promise<AttemptRowSnapshot[]> {
  const result = await disposable.client.db.execute(sql`
    SELECT job_kind, job_key, attempt_no, outcome, is_dead_letter, error_class
    FROM background_job_attempts
    WHERE job_key = ${jobKey.toString()}
    ORDER BY attempt_no, id
  `);
  return rowsOf(result).map((row) => ({
    jobKind: String(row['job_kind']),
    jobKey: String(row['job_key']),
    attemptNo: Number(row['attempt_no']),
    outcome: String(row['outcome']),
    isDeadLetter: row['is_dead_letter'] === true,
    errorClass: asText(row['error_class']),
  }));
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }
  return typeof value === 'string' ? new Date(value) : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
