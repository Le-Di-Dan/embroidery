/**
 * State readers for the `APP4-W01` delivery suites.
 *
 * Separated from the harness because they answer a different question: the
 * harness runs an attempt, these observe what it left behind. `secretAppears`
 * is the important one — the no-plaintext claim is only worth making if it is
 * measured against every textual column the delivery path writes, rather than
 * against the two the author happened to remember.
 *
 * Test-only. Build-excluded via `src/**` + `tests/**`.
 */
import { executeRaw, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';

export interface OutboxRow {
  readonly status: string;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly nextAttemptAt: Date | null;
}

export async function outboxRow(disposable: DisposableDatabase, id: bigint): Promise<OutboxRow> {
  const rows = await executeRaw<Record<string, unknown>>(
    disposable.client.db,
    sql`
      SELECT status, attempt_count, last_error, next_attempt_at
      FROM outbox_events WHERE id = ${id}
    `,
  );
  const row = rows[0] ?? {};
  return {
    status: String(row['status']),
    attemptCount: Number(row['attempt_count']),
    lastError: typeof row['last_error'] === 'string' ? row['last_error'] : null,
    nextAttemptAt: row['next_attempt_at'] instanceof Date ? row['next_attempt_at'] : null,
  };
}

export async function intentStatus(
  disposable: DisposableDatabase,
  intentId: string,
): Promise<string> {
  const rows = await executeRaw<{ status: string }>(
    disposable.client.db,
    sql`SELECT status FROM notification_intents WHERE id = ${intentId}`,
  );
  return rows[0]?.status ?? 'MISSING';
}

export interface DeliveryAttemptRow {
  readonly channel: string;
  readonly outcome: string;
  readonly errorClass: string | null;
  readonly providerMessageRef: string | null;
}

export async function deliveryAttempts(
  disposable: DisposableDatabase,
  intentId: string,
): Promise<DeliveryAttemptRow[]> {
  const rows = await executeRaw<Record<string, unknown>>(
    disposable.client.db,
    sql`
      SELECT channel, outcome, error_class, provider_message_ref
      FROM notification_delivery_attempts
      WHERE intent_id = ${intentId}
      ORDER BY id
    `,
  );
  return rows.map((row) => ({
    channel: String(row['channel']),
    outcome: String(row['outcome']),
    errorClass: typeof row['error_class'] === 'string' ? row['error_class'] : null,
    providerMessageRef:
      typeof row['provider_message_ref'] === 'string' ? row['provider_message_ref'] : null,
  }));
}

export async function backgroundAttempts(
  disposable: DisposableDatabase,
  outboxEventId: bigint,
): Promise<{ attemptNo: number; outcome: string; errorClass: string | null }[]> {
  const rows = await executeRaw<Record<string, unknown>>(
    disposable.client.db,
    sql`
      SELECT attempt_no, outcome, error_class FROM background_job_attempts
      WHERE job_key = ${outboxEventId.toString()} ORDER BY attempt_no, id
    `,
  );
  return rows.map((row) => ({
    attemptNo: Number(row['attempt_no']),
    outcome: String(row['outcome']),
    errorClass: typeof row['error_class'] === 'string' ? row['error_class'] : null,
  }));
}

/**
 * How far ahead the row was scheduled, in seconds, measured by the database.
 *
 * Read as a delta against the database's own `now()` rather than against the
 * test process's clock: the delay was written as `now() + interval` inside one
 * statement, and comparing it to a JavaScript `Date.now()` would fold host clock
 * skew into the assertion.
 */
export async function scheduledDelaySeconds(
  disposable: DisposableDatabase,
  id: bigint,
): Promise<number> {
  const rows = await executeRaw<{ delay: string | number }>(
    disposable.client.db,
    sql`
      SELECT extract(epoch from (next_attempt_at - now())) AS delay
      FROM outbox_events WHERE id = ${id}
    `,
  );
  return Math.round(Number(rows[0]?.delay ?? 0));
}

/**
 * Brings a backed-off row forward so the next claim sees it as due.
 *
 * This is the fake clock. The delay itself is asserted first, from
 * {@link scheduledDelaySeconds}; moving the instant afterwards changes only how
 * long the suite waits, never what the runtime decided.
 */
export async function makeDueNow(disposable: DisposableDatabase, id: bigint): Promise<void> {
  await executeRaw(
    disposable.client.db,
    sql`UPDATE outbox_events SET next_attempt_at = now() - interval '1 second' WHERE id = ${id}`,
  );
}

/**
 * Whether a value appears in any textual or JSON field the delivery path writes.
 *
 * `outbox_events.payload` is excluded by casting it away: it is the ciphertext,
 * the one place the secret is *supposed* to exist, and including it would make
 * the assertion fail for the reason the design exists.
 */
export async function secretAppears(
  disposable: DisposableDatabase,
  secret: string,
): Promise<string[]> {
  const rows = await executeRaw<{ source: string }>(
    disposable.client.db,
    sql`
      SELECT 'notification_intents' AS source FROM notification_intents
      WHERE (id || intent_key || template_key || channel || recipient_masked ||
             params::text || status || correlation_id) LIKE ${`%${secret}%`}
      UNION ALL
      SELECT 'notification_delivery_attempts' FROM notification_delivery_attempts
      WHERE (channel || outcome || coalesce(error_class, '') ||
             coalesce(provider_message_ref, '')) LIKE ${`%${secret}%`}
      UNION ALL
      SELECT 'background_job_attempts' FROM background_job_attempts
      WHERE (job_kind || job_key || outcome || coalesce(error_class, '')) LIKE ${`%${secret}%`}
      UNION ALL
      SELECT 'outbox_events' FROM outbox_events
      WHERE (event_type || aggregate_kind || aggregate_id || status ||
             coalesce(last_error, '')) LIKE ${`%${secret}%`}
      UNION ALL
      SELECT 'audit_events' FROM audit_events
      WHERE (action || target_kind || target_id || coalesce(reason, '') ||
             coalesce(summary::text, '') || coalesce(failure_code, '') ||
             coalesce(system_job_key, '') || correlation_id) LIKE ${`%${secret}%`}
    `,
  );
  return rows.map((row) => row.source);
}
