/**
 * TBL-004 `customers` — one verified customer identity (CTX-CUS, AGG-02).
 *
 * Columns: COL-TBL004-01..05 · Constraints: CST-001, CST-069 (self-merge half)
 * Relationships: REL-014 (self, `merged_into_customer_id`)
 * Indexes: IDX-129 (`ix_customers__merged_into__set`, recommended — slice S25)
 * Owner: Customer module.
 *
 * A row exists **only after a verified submission** (ADR-DB2-001 option A):
 * `verified_at` is NOT NULL and immutable, so an unverified customer cannot be
 * represented at all. Guest sessions leave no identity residue here — TBL-025
 * is the only guest structure. There is no password or credential column: the
 * customer has no account in MVP, and admin credentials live in a separate
 * context (TBL-002).
 *
 * `merged_into_customer_id` is the merge **tombstone pointer** (REL-014): set
 * once by the admin-audited merge workflow (G10), never by matching on a
 * normalized contact value. CST-069 rejects a self-merge at the row level; the
 * survivor≠loser half of that rule lands with `customer_merge_cases` in G10.
 * Historical snapshots are never rewritten by a merge — the pointer is
 * followed forward, history stays put.
 *
 * `anonymized_at` marks field-level PII scrub (ADR-DB1-011 `anonymize`): the
 * row is retained for referential integrity, the PII columns are cleared.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';

export const customers = pgTable(
  'customers',
  {
    id: idColumn().notNull(),
    displayName: text('display_name'),
    verifiedAt: instant('verified_at').notNull(),
    mergedIntoCustomerId: idReference('merged_into_customer_id'),
    anonymizedAt: instant('anonymized_at'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_customers', columns: [t.id] }),
    // REL-014 — tombstone pointer; `restrict` because the survivor row must
    // never be deletable while a loser row still points at it.
    foreignKey({
      name: 'fk_customers__merged_into_customer_id',
      columns: [t.mergedIntoCustomerId],
      foreignColumns: [t.id],
    }).onDelete('restrict'),
    // CST-069 (customers half) — a customer cannot be merged into itself.
    check('ck_customers__no_self_merge', sql`${t.mergedIntoCustomerId} <> ${t.id}`),
  ],
);
