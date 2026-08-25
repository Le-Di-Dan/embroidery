/**
 * TBL-075 `background_job_attempts` — worker attempt evidence (REQ-OUTBOX-002).
 *
 * Append-only: the store exposes `record` and reads, and **no** update path.
 * That is not a convention here — the S24 trigger rejects an UPDATE on these
 * rows, so an update method could only ever throw.
 *
 * A terminal failure is a row with `isDeadLetter`, not a separate table.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, schema } from '@embroidery/database';
import type { JobAttemptOutcome } from '@embroidery/database';
import { and, desc, eq } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';

const { backgroundJobAttempts } = schema;

/**
 * Job kinds the worker may record attempts for.
 *
 * `job_key` is free-form by design (it identifies the specific work item), but
 * the *kind* is validated against this closed set at write time (G-DB7-51):
 * an unrecognised kind means an operator's dead-letter query will silently miss
 * those rows.
 */
export const BACKGROUND_JOB_KINDS = [
  'OUTBOX_DISPATCH',
  'NOTIFICATION_DELIVERY',
  'ASSET_PROCESSING',
  'MOCKUP_RENDERING',
  'WATERMARK_RENDERING',
  'SESSION_CLEANUP',
  'PAYMENT_RECONCILIATION',
  'RETENTION_SWEEP',
  // `APP7-W01` — the `design.approved` order conversion. Added on the exact
  // terms `ASSET_PROCESSING` was chosen over `OUTBOX_DISPATCH` (IMP-D030):
  // `job_kind` is open text with **no CHECK**, so this list is the G-DB7-51
  // write-time guard and not a schema constraint — no migration. The work is
  // creating an order, not dispatching an outbox row, and filing it under the
  // transport kind would hide it from an operator's dead-letter query.
  'ORDER_CREATION',
  // `APP8-W01` — the `payment.verified` official inventory reservation
  // (`TR-LC17-04`). Added on exactly the terms `ORDER_CREATION` was, and for the
  // same reason: the work is committing stock against an order, not dispatching
  // an outbox row, and an operator querying dead-lettered reservations must be
  // able to name the kind. No CHECK, no migration.
  'INVENTORY_RESERVATION',
] as const;

export type BackgroundJobKind = (typeof BACKGROUND_JOB_KINDS)[number];

export interface RecordJobAttemptInput {
  readonly jobKind: BackgroundJobKind;
  readonly jobKey: string;
  readonly attemptNo: number;
  readonly outcome: JobAttemptOutcome;
  /**
   * A stable error **class**, never a provider message or stack trace: this
   * column is read by operators and must not become a PII sink.
   */
  readonly errorClass?: string | undefined;
  readonly finishedAt?: Date | undefined;
}

export interface JobAttemptRecord {
  readonly id: bigint;
  readonly jobKind: BackgroundJobKind;
  readonly jobKey: string;
  readonly attemptNo: number;
  readonly outcome: JobAttemptOutcome;
  readonly isDeadLetter: boolean;
  readonly errorClass: string | undefined;
  readonly finishedAt: Date;
}

@Injectable()
export class BackgroundJobAttemptStore extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Appends one attempt outcome.
   *
   * Writes **outside** any ambient transaction, on purpose. An attempt record
   * exists to explain why the surrounding work failed; enlisting it in that
   * work's transaction would roll the evidence back along with the failure it
   * documents, leaving nothing behind. Verified by a test that rolls back a
   * transaction and asserts the attempt survived.
   */
  async record(input: RecordJobAttemptInput): Promise<JobAttemptRecord> {
    return this.run('record', async () => {
      assertKnownJobKind(input.jobKind);

      const [row] = await this.dbOutsideTransaction
        .insert(backgroundJobAttempts)
        .values({
          jobKind: input.jobKind,
          jobKey: input.jobKey,
          attemptNo: input.attemptNo,
          outcome: input.outcome,
          // Derived, not caller-supplied: dead-letter *means* terminal failure,
          // and letting a caller set them independently invites the pair to
          // disagree in the operator's dead-letter query.
          isDeadLetter: input.outcome === 'FAILED_TERMINAL',
          errorClass: input.errorClass ?? null,
          finishedAt: input.finishedAt ?? new Date(),
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'BackgroundJobAttemptStore.record',
          'JOB_ATTEMPT_NOT_RECORDED',
          'Could not record the job attempt.',
        );
      }
      return toDomain(row);
    });
  }

  /** Attempt history for one work item, newest first. */
  async listAttempts(jobKind: BackgroundJobKind, jobKey: string): Promise<JobAttemptRecord[]> {
    return this.run('listAttempts', async () => {
      const rows = await this.db
        .select()
        .from(backgroundJobAttempts)
        .where(
          and(eq(backgroundJobAttempts.jobKind, jobKind), eq(backgroundJobAttempts.jobKey, jobKey)),
        )
        .orderBy(desc(backgroundJobAttempts.attemptNo));

      return rows.map(toDomain);
    });
  }

  /** Dead-letter rows for one job kind — the operator's manual-review queue. */
  async listDeadLetters(jobKind: BackgroundJobKind): Promise<JobAttemptRecord[]> {
    return this.run('listDeadLetters', async () => {
      const rows = await this.db
        .select()
        .from(backgroundJobAttempts)
        .where(
          and(
            eq(backgroundJobAttempts.jobKind, jobKind),
            eq(backgroundJobAttempts.isDeadLetter, true),
          ),
        )
        .orderBy(desc(backgroundJobAttempts.finishedAt));

      return rows.map(toDomain);
    });
  }
}

type JobAttemptRow = typeof backgroundJobAttempts.$inferSelect;

function toDomain(row: JobAttemptRow): JobAttemptRecord {
  return {
    id: row.id,
    jobKind: row.jobKind as BackgroundJobKind,
    jobKey: row.jobKey,
    attemptNo: row.attemptNo,
    outcome: row.outcome as JobAttemptOutcome,
    isDeadLetter: row.isDeadLetter,
    errorClass: row.errorClass ?? undefined,
    finishedAt: row.finishedAt,
  };
}

/**
 * G-DB7-51 — the job key is free-form, but the kind is a closed set.
 *
 * Exported because the worker queue seam writes attempt rows on the same
 * closed set and must reject an unknown kind identically; two copies of this
 * check would be one refactor away from disagreeing.
 */
export function assertKnownJobKind(kind: string): void {
  if (!(BACKGROUND_JOB_KINDS as readonly string[]).includes(kind)) {
    throw guardViolationError(
      'BackgroundJobAttemptStore.record',
      'UNKNOWN_JOB_KIND',
      'That job kind is not recognised.',
    );
  }
}
