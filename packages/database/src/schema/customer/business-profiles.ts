/**
 * TBL-078 `business_profiles` — the dormant B2B profile of one customer
 * (CTX-CUS, AGG-02).
 *
 * Columns: COL-TBL078-01..04 · Constraints: CST-001, CST-051 (customer_id half)
 * Relationships: REL-004 (→ customers, 1–0..1)
 * Indexes: IDX-062 (`uq_business_profiles__customer`, constraint-created)
 * Owner: Customer module.
 *
 * **Dormant B2B readiness only** (REQ-CUST-003): no MVP workflow reads these
 * columns. The table exists so a future B2B feature is additive rather than a
 * schema change on `customers`. Exactly the four DB4 columns — adding more
 * B2B fields now would be speculative.
 *
 * All three business columns are PII and are anonymization targets via the
 * parent customer's scrub (ADR-DB1-011 `anonymize`).
 */
import { foreignKey, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { customers } from './customers';

export const businessProfiles = pgTable(
  'business_profiles',
  {
    id: idColumn().notNull(),
    customerId: idReference('customer_id').notNull(),
    companyName: text('company_name').notNull(),
    taxCode: text('tax_code'),
    billingContact: text('billing_contact'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_business_profiles', columns: [t.id] }),
    // CST-051 / IDX-062 — at most one profile per customer (1–0..1).
    unique('uq_business_profiles__customer').on(t.customerId),
    // REL-004 — composition; profile cannot outlive its customer, and the
    // customer row is never hard-deleted anyway (anonymize, not delete).
    foreignKey({
      name: 'fk_business_profiles__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
  ],
);
