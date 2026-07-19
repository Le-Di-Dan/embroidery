/**
 * TBL-059 `production_jobs` — one production job against exactly one
 * approval snapshot (CTX-PRD, AGG-17, `root`, mutable).
 *
 * Columns: COL-TBL059-01..06 (-06 ×3) · Constraints: CST-001, CST-041
 * (UQ, `(order_id, approval_snapshot_id)` — INV-19, `production.start`
 * idempotency)
 * Relationships: REL-090 (→ orders, restrict — CC-12 order-row contention),
 * REL-091 (→ approval_snapshots, restrict — exact approval, INV-03),
 * REL-092 (→ production_jobs self, `reworked_from_job_id`, restrict —
 * ADR-DB3-003 r3 lineage)
 * Indexes: IDX-041 n/a; IDX-082 (P0 required — active-job queue)
 * Owner: Production module.
 *
 * **Order-scoped, not Order-Item-scoped.** DB4's column dictionary carries
 * no `order_item_id` on this table — a job is created per (order, approval
 * snapshot), never per line item; `CST-041`'s unique pair is the physical
 * `production.start` idempotency arbiter (INV-19), not a business rule
 * invented here.
 *
 * **Rework is never a spec mutation.** LC-18's `PLANNED/STARTED→CANCELLED`
 * transition with a rework reason, followed by a fresh `(create)→PLANNED`
 * row after a new approval, is how a redo is represented — never an UPDATE
 * on an existing job or its specification. `reworked_from_job_id` is the
 * lineage pointer (self-referencing, nullable); same-chain consistency of
 * that pointer (that the new approval actually supersedes the old one) is
 * TX/App, not a database-level guard, same tier as every other lineage/
 * current-pointer finding in this engagement.
 *
 * No trigger creates this row from a Payment/Reservation event, starts
 * Production automatically, or advances `orders.status` — TR-LC18-01/02/03
 * (DB3) are TX/App-owned; this table only stores the resulting facts.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { orders } from '../ordering/orders';
import { approvalSnapshots } from '../design/approval-snapshots';

/** LC-18. Canonical source — see DB3 §"LC-18 — Production Job". */
export const PRODUCTION_JOB_STATES = ['PLANNED', 'STARTED', 'COMPLETED', 'CANCELLED'] as const;
export type ProductionJobState = (typeof PRODUCTION_JOB_STATES)[number];

export const productionJobs = pgTable(
  'production_jobs',
  {
    id: idColumn().notNull(),
    orderId: idReference('order_id').notNull(),
    approvalSnapshotId: idReference('approval_snapshot_id').notNull(),
    status: stateColumn().notNull(),
    reworkedFromJobId: idReference('reworked_from_job_id'),
    cancelledReason: text('cancelled_reason'),
    startedAt: instant('started_at'),
    completedAt: instant('completed_at'),
    cancelledAt: instant('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_production_jobs', columns: [t.id] }),
    // CST-041 — one job per (order, approval snapshot); production.start idempotency.
    unique('uq_production_jobs__order_approval_snapshot').on(t.orderId, t.approvalSnapshotId),
    // REL-090 — CC-12 order-row contention on start/hold/cancel.
    foreignKey({
      name: 'fk_production_jobs__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    // REL-091 — exact approval evidence (INV-03), never a mutable pointer.
    foreignKey({
      name: 'fk_production_jobs__approval_snapshot_id',
      columns: [t.approvalSnapshotId],
      foreignColumns: [approvalSnapshots.id],
    }).onDelete('restrict'),
    // REL-092 — rework lineage (self-referencing, nullable).
    foreignKey({
      name: 'fk_production_jobs__reworked_from_job_id',
      columns: [t.reworkedFromJobId],
      foreignColumns: [t.id],
    }).onDelete('restrict'),
    check('ck_production_jobs__status_allowed', stateCheck(t.status, PRODUCTION_JOB_STATES)),
    // COL-TBL059-05 — [R] on CANCELLED: evidence for cancel/rework/supersession.
    check(
      'ck_production_jobs__cancelled_reason_required',
      sql`${t.status} <> 'CANCELLED' or ${t.cancelledReason} is not null`,
    ),
    // IDX-082 — active-job queue (PLANNED/STARTED), most-recent first.
    index('ix_production_jobs__created_id__active')
      .on(t.createdAt, t.id)
      .where(sql`${t.status} in ('PLANNED', 'STARTED')`),
  ],
);
