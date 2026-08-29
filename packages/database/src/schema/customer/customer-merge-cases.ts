/**
 * TBL-009 `customer_merge_cases` — one admin-initiated merge decision:
 * survivor ← loser (CTX-CUS, AGG-02 workflow).
 *
 * Columns: COL-TBL009-01..06 · Constraints: CST-001, CST-010 (IDX-009),
 * CST-069 (second instance — survivor ≠ loser; the first instance guards
 * `customers.merged_into_customer_id`, implemented in G3)
 * Relationships: REL-012 (→ customers ×2, survivor + loser)
 * Indexes: IDX-009 (constraint-created, pUQ one open merge per pair)
 * Owner: Customer module.
 *
 * **Explicit, exceptional, admin-only.** A merge case is never created by
 * matching a normalized contact value — CST-005's partial unique already
 * prevents two *verified* links from coexisting; a merge is the deliberate,
 * audited join of two customer identities an admin has already decided
 * belong together (ADR-DB2-001 r5, CC-27). No trigger creates or executes
 * a merge; that saga runs in application code across `customer_merge_cases`
 * and `customer_merge_events`, with the ordered-lock discipline the two
 * customer rows require (CC-27) and DB8 owns the concurrent-case race.
 *
 * `requested_by_admin_id` has **no FK**: DB4's REL-105 actor-evidence list
 * enumerates TBL-042/045/063/072 explicitly and does not name TBL-009, so
 * this follows the same evidence-class precedent already accepted for
 * `inventory_ledger_entries.admin_id` (G6) and
 * `request_moderation_notes.admin_id` (G9) — a documented gap, not an
 * invented FK.
 *
 * Executing a merge moves **live identity references** and rewrites **no
 * history** (corrected in APP10-B03; the earlier note here conflated the two).
 * The distinction is per column, not per table:
 *
 * - *live ownership row* → **repointed** to the survivor:
 *   `orders.customer_id`, `custom_requests.customer_id`,
 *   `customer_contact_points.customer_id`, `business_profiles.customer_id`,
 *   `assets.uploaded_by_customer_id` (DB4 §7, DB3 §4 step 2; IDX-118
 *   `ix_orders__customer` is provisioned for exactly this sweep, "CC-27
 *   merge");
 * - *frozen evidence and append-only history* → **never rewritten**:
 *   `order_transitions` and `custom_request_transitions` (who acted, at a
 *   moment that has passed), `approval_snapshots`, `quotation_acceptances`,
 *   `design_reviews` and `audit_events`. These keep their original
 *   `customer_id` and their frozen contact copies.
 *
 * So an *order* changes owner while that same order’s *transition history*
 * does not: the row records a decision the merged-away identity took, and
 * rewriting it would rewrite evidence rather than move ownership. This table
 * records the merge decision, `customer_merge_events` records each executed
 * step, and `customers.merged_into_customer_id` (G3) is the tombstone pointer
 * new activity resolves forward through.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { customers } from './customers';

/** +5 in DB4_STATE_AND_TRANSITION_STORAGE.md. Canonical source — see DB5-A09. */
export const CUSTOMER_MERGE_CASE_STATES = ['REQUESTED', 'EXECUTED', 'REJECTED'] as const;
export type CustomerMergeCaseState = (typeof CUSTOMER_MERGE_CASE_STATES)[number];

export const customerMergeCases = pgTable(
  'customer_merge_cases',
  {
    id: idColumn().notNull(),
    survivorCustomerId: idReference('survivor_customer_id').notNull(),
    loserCustomerId: idReference('loser_customer_id').notNull(),
    status: stateColumn().notNull(),
    reason: text('reason').notNull(),
    requestedByAdminId: idReference('requested_by_admin_id').notNull(),
    decidedAt: instant('decided_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_customer_merge_cases', columns: [t.id] }),
    // CST-010 / IDX-009 — one open merge per (survivor, loser) pair; the
    // ordered-lock discipline (CC-27) still applies at the application
    // layer, this index rejects the duplicate row outright.
    uniqueIndex('uq_customer_merge_cases__survivor_loser__requested')
      .on(t.survivorCustomerId, t.loserCustomerId)
      .where(sql`${t.status} = 'REQUESTED'`),
    // REL-012 — restrict: a customer under an open or historical merge case
    // must never be deletable out from under the evidence.
    foreignKey({
      name: 'fk_customer_merge_cases__survivor_customer_id',
      columns: [t.survivorCustomerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_customer_merge_cases__loser_customer_id',
      columns: [t.loserCustomerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    // requested_by_admin_id carries no FK by design (see file-level note).
    check(
      'ck_customer_merge_cases__status_allowed',
      stateCheck(t.status, CUSTOMER_MERGE_CASE_STATES),
    ),
    // CST-069 (second instance) — a customer cannot be merged into itself.
    check(
      'ck_customer_merge_cases__no_self_merge',
      sql`${t.survivorCustomerId} <> ${t.loserCustomerId}`,
    ),
  ],
);
