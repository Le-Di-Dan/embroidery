/**
 * TBL-063 `production_job_transitions` — one job state transition,
 * including a rework cancellation (CTX-PRD, AGG-17, `append` —
 * ADR-DB4-002 Tier A history for LC-18).
 *
 * Columns: COL-TBL063-01..05 (-03 ×3) · Constraints: CST-001, from/to in
 * the LC-18 set, CST-098-class append-only (S24)
 * Relationships: REL-094 (→ production_jobs, restrict), REL-105 actor edge
 * for this table: `admin_id` → `admin_accounts` (TBL-063 is one of
 * REL-105's four explicitly enumerated tables — unlike `production_notes`,
 * this actor column *does* get a physical FK)
 * Indexes: IDX-102 (P0 required — job timeline)
 * Owner: Production module.
 *
 * `from_status`/`to_status` both CHECK against the same LC-18 tuple as the
 * root's status column. Whether a *pair* is a legal transition is the DB3
 * transition matrix — TX/App and DB7's matrix tests, not a CHECK, same
 * treatment as `order_transitions`/`custom_request_transitions`.
 * `actor_kind` carries no dictionary set and none is invented (same
 * precedent). `system_job_key` is a plain evidence string for a
 * system-initiated transition, not a row reference — no FK.
 *
 * Rework is represented as a `PLANNED/STARTED→CANCELLED` row with
 * `reason` set, followed by a fresh `(create)→PLANNED` row on the new job
 * after a new approval (LC-18) — never a mutation of this or any existing
 * row.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { productionJobs, PRODUCTION_JOB_STATES } from './production-jobs';
import { adminAccounts } from '../identity/admin-accounts';

export const productionJobTransitions = pgTable(
  'production_job_transitions',
  {
    id: sequenceColumn(),
    productionJobId: idReference('production_job_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    actorKind: text('actor_kind').notNull(),
    adminId: idReference('admin_id'),
    systemJobKey: text('system_job_key'),
    reason: text('reason'),
    correlationId: text('correlation_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_production_job_transitions', columns: [t.id] }),
    // REL-094 — history is composed under its job; restrict keeps it intact.
    foreignKey({
      name: 'fk_production_job_transitions__production_job_id',
      columns: [t.productionJobId],
      foreignColumns: [productionJobs.id],
    }).onDelete('restrict'),
    // REL-105 — TBL-063 is in the closed enumeration; admin_id gets a real FK.
    foreignKey({
      name: 'fk_production_job_transitions__admin_id',
      columns: [t.adminId],
      foreignColumns: [adminAccounts.id],
    }).onDelete('restrict'),
    check(
      'ck_production_job_transitions__from_status_allowed',
      stateCheck(t.fromStatus, PRODUCTION_JOB_STATES),
    ),
    check(
      'ck_production_job_transitions__to_status_allowed',
      stateCheck(t.toStatus, PRODUCTION_JOB_STATES),
    ),
    // COL-TBL063-04 — [R] on cancel/rework: to_status=CANCELLED is the only
    // LC-18 outcome that represents cancel/rework; directly checkable same-row.
    check(
      'ck_production_job_transitions__reason_required',
      sql`${t.toStatus} <> 'CANCELLED' or ${t.reason} is not null`,
    ),
    // IDX-102 — job timeline replay in insert order.
    index('ix_production_job_transitions__production_job_id').on(t.productionJobId, t.id),
  ],
);
