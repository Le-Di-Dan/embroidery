/**
 * TBL-075 `background_job_attempts` — one worker job attempt outcome
 * (CTX-PLT). A terminal failure is the dead-letter row.
 *
 * Columns: COL-TBL075-01..07 · Constraints: CST-001, CST-049, CST-060, CST-062,
 * CST-098 (append-only)
 * Indexes: IDX-059 (attempt collision), IDX-131 (dead-letter view, slice S25)
 * Owner: Platform module.
 *
 * **Append-only** (CST-098): no `updated_at`, and the reject-mutation trigger
 * is authored in slice S24. An attempt record is evidence of what happened; a
 * requeue is a *new* attempt row, never an edit of the old one.
 *
 * `is_dead_letter` is a stored column rather than a derived expression because
 * it is the dead-letter view's index predicate (IDX-131), and a partial index
 * predicate must be immutable.
 *
 * `error_class` carries a classification only — never a payload or PII.
 */
import { boolean, check, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { sequenceColumn } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';

/** Attempt outcome values (DB4 COL-TBL075-04). Canonical source — DB5-A09. */
export const JOB_ATTEMPT_OUTCOMES = ['SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'] as const;
export type JobAttemptOutcome = (typeof JOB_ATTEMPT_OUTCOMES)[number];

export const backgroundJobAttempts = pgTable(
  'background_job_attempts',
  {
    id: sequenceColumn(),
    jobKind: text('job_kind').notNull(),
    jobKey: text('job_key').notNull(),
    attemptNo: integer('attempt_no').notNull(),
    outcome: text('outcome').notNull(),
    isDeadLetter: boolean('is_dead_letter').notNull(),
    errorClass: text('error_class'),
    finishedAt: instant('finished_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_background_job_attempts', columns: [t.id] }),
    // CST-049 / IDX-059 — one record per (job, attempt number).
    unique('uq_background_job_attempts__kind_key_attempt').on(t.jobKind, t.jobKey, t.attemptNo),
    // CST-060 — outcome is this table's state column.
    check(
      'ck_background_job_attempts__outcome_allowed',
      stateCheck(t.outcome, JOB_ATTEMPT_OUTCOMES),
    ),
    // CST-062 — attempt numbering starts at 1.
    check('ck_background_job_attempts__attempt_no_positive', sql`${t.attemptNo} > 0`),
  ],
);
