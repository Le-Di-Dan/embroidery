/**
 * TBL-062 `production_notes` — one production note (CTX-PRD, AGG-17,
 * `append`).
 *
 * Columns: COL-TBL062-01..03 · Constraints: CST-001, CST-098-class
 * append-only (S24)
 * Relationships: REL-094 (→ production_jobs, restrict)
 * Indexes: IDX-138 (recommended) → S25; no other non-PK index
 * Owner: Production module.
 *
 * Append-only evidence: no `updated_at`, rows are never edited — a
 * corrected note is a new row. Enforcing reject-UPDATE/DELETE at the
 * database level needs a trigger — **not yet a database mechanism**, same
 * honestly-documented gap as every other append-only table pending S24;
 * this group implements the CHECK/FK/index layer only.
 *
 * **`admin_id` stays a no-FK evidence reference (DEV-DB6-015).** DB4's
 * column dictionary carries a dictionary arrow toward `admin_accounts`, but
 * REL-105 FKs actor references only on the tables it explicitly enumerates
 * (TBL-042/045/063/072) — `production_notes` (TBL-062) is not one of them,
 * same treatment as `request_moderation_notes.admin_id` (G9) and
 * `payment_reconciliations.admin_id` (G16). No FK is added; application and
 * audit integrity own it. This is distinct from `production_job_
 * transitions.admin_id` (TBL-063), which *is* in REL-105's enumeration and
 * gets a real FK — the two tables are not interchangeable under this rule.
 */
import { foreignKey, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { productionJobs } from './production-jobs';

export const productionNotes = pgTable(
  'production_notes',
  {
    id: sequenceColumn(),
    productionJobId: idReference('production_job_id').notNull(),
    note: text('note').notNull(),
    adminId: idReference('admin_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_production_notes', columns: [t.id] }),
    // REL-094 — the job this note belongs to.
    foreignKey({
      name: 'fk_production_notes__production_job_id',
      columns: [t.productionJobId],
      foreignColumns: [productionJobs.id],
    }).onDelete('restrict'),
    // admin_id — DEV-DB6-015, no foreignKey() declared.
    // IDX-138 (recommended) deferred to S25 — not implemented in this group.
  ],
);
