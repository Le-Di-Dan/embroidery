/**
 * The two bounded reads that back the scrape-time gauges
 * (`APP12-H03` §8, §9, §23).
 *
 * §8 is explicit: **do not full-scan the database on every scrape**, and if a
 * safe backlog metric would require a migration, do not add one. Neither of
 * these needs one, and that is not luck — both predicates are copied verbatim
 * from partial indexes the schema already carries:
 *
 * ```text
 * ix_outbox_events__next_attempt_id__pending       (next_attempt_at NULLS FIRST, id)
 *                                                   WHERE status = 'PENDING'
 * ix_inventory_reservations__expires_id__reserved  (expires_at, id)
 *                                                   WHERE status = 'RESERVED'
 *                                                     AND expires_at IS NOT NULL
 * ```
 *
 * Each query is additionally **capped**. A count over a partial index is
 * proportional to the number of matching rows, which is near zero in a healthy
 * system and unbounded in exactly the incident these gauges exist to reveal —
 * so the count is taken over a `LIMIT`ed subquery. The gauge saturates at the
 * cap rather than making the scrape slower the worse things get, and an alert
 * that fires at a threshold far below the cap loses nothing by it.
 *
 * No lock of any kind, no `FOR UPDATE`, no transaction. §23 requires that a
 * DB-backed collector hold no business lock; these are unlocked reads whose
 * answers are a snapshot and are treated as one.
 */
import { Injectable } from '@nestjs/common';
import { executeRaw, sql } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';

/**
 * The ceiling each gauge saturates at.
 *
 * Chosen against the real system rather than as a round number: a shop doing
 * fewer than a hundred orders a month has a due-work queue that is empty almost
 * always, so a thousand due rows is already several orders of magnitude past
 * "something is wrong" and any threshold worth alerting on sits far below it.
 */
export const TELEMETRY_SNAPSHOT_CAP = 1_000;

export interface QueueBacklogSnapshot {
  /** Due jobs, saturating at {@link TELEMETRY_SNAPSHOT_CAP}. */
  readonly pending: number;
  /** Age of the oldest due job in seconds; `0` when nothing is due. */
  readonly oldestPendingAgeSeconds: number;
}

@Injectable()
export class TelemetrySnapshotRepository extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Due outbox work at this instant.
   *
   * "Due" is the claim filter's own definition — `PENDING` with no deferral, or
   * a deferral that has passed — so the gauge answers the same question the
   * poll loop does. A row deferred into the future is *not* backlog: it is a
   * retry waiting for its backoff, and counting it would make every transient
   * failure look like a stuck queue.
   *
   * The age is measured from `created_at`, not from `next_attempt_at`. A job
   * that has been retried four times has a recent `next_attempt_at` and an old
   * `created_at`, and the operator's question — "how long has anything been
   * stuck?" — is about the latter.
   */
  async queueBacklog(now: Date): Promise<QueueBacklogSnapshot> {
    return this.run('queueBacklog', async () => {
      const rows = await executeRaw<{ pending: string; oldest_age_seconds: string | null }>(
        this.db,
        sql`
          select count(*)::text as pending,
                 coalesce(
                   extract(epoch from (${now}::timestamptz - min(due.created_at))),
                   0
                 )::text as oldest_age_seconds
            from (
              select e.created_at
                from outbox_events e
               where e.status = 'PENDING'
                 and (e.next_attempt_at is null or e.next_attempt_at <= ${now})
               order by e.next_attempt_at nulls first, e.id
               limit ${TELEMETRY_SNAPSHOT_CAP}
            ) due
        `,
      );
      const row = rows[0];
      return {
        pending: Number(row?.pending ?? '0'),
        oldestPendingAgeSeconds: Math.max(0, Math.round(Number(row?.oldest_age_seconds ?? '0'))),
      };
    });
  }

  /**
   * Reservations whose window has passed and which the sweep has not released
   * (`APP12-H03` §9).
   *
   * A non-zero value here is the one inventory invariant an operator can act
   * on without a database session: stock is being held for orders that are no
   * longer entitled to it, which means the expiry sweep is not running or is
   * failing. The deadline is the reservation's own `expires_at` — an existing
   * domain deadline, not an invented SLA.
   *
   * A small non-zero reading is normal between sweep passes, which is why the
   * alert on this gauge is duration-qualified rather than instantaneous.
   */
  async expiredReservationsStillHeld(now: Date): Promise<number> {
    return this.run('expiredReservationsStillHeld', async () => {
      const rows = await executeRaw<{ violations: string }>(
        this.db,
        sql`
          select count(*)::text as violations
            from (
              select r.id
                from inventory_reservations r
               where r.status = 'RESERVED'
                 and r.expires_at is not null
                 and r.expires_at <= ${now}
               order by r.expires_at, r.id
               limit ${TELEMETRY_SNAPSHOT_CAP}
            ) overdue
        `,
      );
      return Number(rows[0]?.violations ?? '0');
    });
  }
}
