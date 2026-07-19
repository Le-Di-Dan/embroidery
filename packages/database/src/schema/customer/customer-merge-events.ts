/**
 * TBL-010 `customer_merge_events` — one append-only step of merge evidence:
 * what was repointed, from which merge case (CTX-CUS, AGG-02, `append`).
 *
 * Columns: COL-TBL010-01..05 · Constraints: CST-001, CST-098 (**append-only
 * trigger target, S24**)
 * Relationships: REL-013 (→ customer_merge_cases)
 * Indexes: IDX-135 (recommended) → S25
 * Owner: Customer module.
 *
 * `subject_table`/`subject_id` is the same justified cross-cutting
 * correlation pattern as `inventory_ledger_entries`'s actor columns and
 * `outbox_events`' aggregate reference (task §8.3): no generic polymorphic
 * FK is invented, `subject_id` is stored as `text` because the repointed
 * row may carry either a `uuid` or `bigint` key depending on
 * `subject_table`, and `detail` carries a transfer summary only — no PII
 * dump (per DB4's explicit column note).
 *
 * **Append-only** (CST-098): no `updated_at`, rows are never edited or
 * deleted — the S24 trigger target is not yet a database mechanism (same
 * honestly-documented gap as `inventory_ledger_entries`/
 * `custom_request_transitions`); a correction is a new event row, never an
 * edit to an existing one.
 */
import { check, foreignKey, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { customerMergeCases } from './customer-merge-cases';

/** COL-TBL010-02 closed step-kind set (DB4). */
export const MERGE_EVENT_STEP_KINDS = [
  'OWNERSHIP_TRANSFER',
  'CONTACT_MOVE',
  'GRANT_REVOKE',
  'TOMBSTONE',
] as const;
export type MergeEventStepKind = (typeof MERGE_EVENT_STEP_KINDS)[number];

export const customerMergeEvents = pgTable(
  'customer_merge_events',
  {
    id: sequenceColumn(),
    mergeCaseId: idReference('merge_case_id').notNull(),
    stepKind: text('step_kind').notNull(),
    subjectTable: text('subject_table').notNull(),
    subjectId: text('subject_id').notNull(),
    detail: text('detail'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_customer_merge_events', columns: [t.id] }),
    // REL-013 — history is composed under its merge case; restrict keeps
    // the evidence trail intact for as long as the case row exists.
    foreignKey({
      name: 'fk_customer_merge_events__merge_case_id',
      columns: [t.mergeCaseId],
      foreignColumns: [customerMergeCases.id],
    }).onDelete('restrict'),
    check(
      'ck_customer_merge_events__step_kind_allowed',
      stateCheck(t.stepKind, MERGE_EVENT_STEP_KINDS),
    ),
  ],
);
