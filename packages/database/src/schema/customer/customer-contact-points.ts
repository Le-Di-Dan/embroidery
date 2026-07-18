/**
 * TBL-005 `customer_contact_points` — one email/phone contact of a customer
 * (CTX-CUS, AGG-02).
 *
 * Columns: COL-TBL005-01..09 · Constraints: CST-001, CST-005, CST-006,
 * contact-kind value check (COL-TBL005-02 `(CK)`)
 * Relationships: REL-005 (→ customers)
 * Indexes: IDX-004, IDX-005 (explicit partial uniques),
 *          IDX-134 (`ix_customer_contact_points__customer`, P0)
 * Owner: Customer module.
 *
 * The unique object is the **active verified link**, not the raw value
 * (ADR-DB2-001 r5/6): CST-005 is partial on `verified_at IS NOT NULL AND
 * deactivated_at IS NULL`, so the same normalized email may exist unverified
 * on several customers, or deactivated on an old one — only one customer can
 * hold it *verified and active* at a time. `normalized_value` supports lookup
 * and dedup candidates only; it never decides identity, and no unverified
 * match may auto-link (App rule; merge in G10 is the only identity-join path).
 *
 * `normalized_value` is lowercase email / E.164-style phone (CON-163/164);
 * `display_value` keeps the as-entered copy. Both are PII with `anonymized_at`
 * as the scrub marker — rows are retained, fields cleared (ADR-DB1-011).
 *
 * There is no status column: link state is carried by the two timestamps
 * (`verified_at`, `deactivated_at`), which is exactly what the CST-005
 * predicate reads. No DB3 lifecycle owns this table, so A09 gains no entry.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { customers } from './customers';

/** COL-TBL005-02 closed value set (DB4). Not a lifecycle — a kind. */
export const CONTACT_KINDS = ['EMAIL', 'PHONE'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const customerContactPoints = pgTable(
  'customer_contact_points',
  {
    id: idColumn().notNull(),
    customerId: idReference('customer_id').notNull(),
    contactKind: text('contact_kind').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    displayValue: text('display_value').notNull(),
    isPrimary: boolean('is_primary').notNull(),
    verifiedAt: instant('verified_at'),
    verifiedSource: text('verified_source'),
    deactivatedAt: instant('deactivated_at'),
    anonymizedAt: instant('anonymized_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_customer_contact_points', columns: [t.id] }),
    // REL-005 — composition; anonymize clears fields, rows stay.
    foreignKey({
      name: 'fk_customer_contact_points__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    // CST-005 / IDX-004 — one ACTIVE VERIFIED link per (kind, value) across
    // all customers. The CC-17 arbiter: a concurrent second link loses with
    // 23505 instead of racing a read-then-write check.
    uniqueIndex('uq_customer_contact_points__kind_value__verified')
      .on(t.contactKind, t.normalizedValue)
      .where(sql`${t.verifiedAt} is not null and ${t.deactivatedAt} is null`),
    // CST-006 / IDX-005 — one primary contact per customer.
    uniqueIndex('uq_customer_contact_points__customer__primary')
      .on(t.customerId)
      .where(sql`${t.isPrimary}`),
    // IDX-134 — P0: customer detail reads and the CC-27 merge sweep must find
    // every contact of a customer, including unverified/deactivated ones,
    // which the partial uniques structurally cannot serve.
    index('ix_customer_contact_points__customer').on(t.customerId),
    // COL-TBL005-02 `(CK)` — closed kind set.
    check(
      'ck_customer_contact_points__contact_kind_allowed',
      sql`${t.contactKind} in ('EMAIL', 'PHONE')`,
    ),
  ],
);
