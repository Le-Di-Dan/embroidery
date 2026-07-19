/**
 * TBL-037 `custom_requests` — one customer case/request: the verified
 * business intake root (CTX-ORD, AGG-13).
 *
 * Columns: COL-TBL037-01..10 (-04 ×2) · Constraints: CST-001, CST-026
 * (IDX-028), CST-060 (LC-11)
 * Relationships: REL-060 (→ customers), REL-061 ×2 (→ products/variants,
 * nullable — store-product subject), REL-062 ×2 current pointers:
 * → design_cases (**custom SQL in this group** — header↔child cycle, same
 * mechanism as REL-102/0004) and → quotations (**implemented in G14** by
 * custom SQL, same header↔child cycle class — `quotations` did not exist
 * when this group ran)
 * Indexes: IDX-028 (constraint-created), IDX-073 (P1, with group);
 * IDX-117 (recommended, S25)
 * Owner: Ordering module.
 *
 * **A request is not an order, a quotation, or a design session.** It exists
 * only after a verified submission (ADR-DB2-001): `customer_id` is NOT NULL
 * because the submission transaction creates/resolves the customer *first* —
 * verification evidence (G8) is consumed as a transaction guard, not stored
 * here (no challenge FK exists in DB4, and none is invented). No money, no
 * deposit, no reservation, no production/shipping field.
 *
 * Subject model: a store-product request carries nullable
 * `product_id`/`product_variant_id`; a customer-owned-product request
 * carries neither and owns a TBL-038 row instead. The subject-presence rule
 * is **cross-table** (exactly one of catalog-subject or COP row), so DB4
 * assigns it to TX/App — no same-row CHECK can see it and none is faked.
 *
 * `submitted_session_id` is provenance with **no REL row and no FK** (same
 * evidence class as the mirror column `design_sessions.submitted_request_id`
 * decided in G7): sessions are hard-TTL-deleted and the request must outlive
 * them; history is carried by the request's own facts, not the session.
 *
 * `code` is the human request code — never an authorization input (CST-026
 * note); grant-scoped access (G10) is the authz mechanism.
 */
import { foreignKey, pgTable, primaryKey, text, unique, check, index } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { customers } from '../customer/customers';
import { products } from '../catalog/products';
import { productVariants } from '../catalog/product-variants';

/** LC-11. Canonical source — see DB5-A09. */
export const CUSTOM_REQUEST_STATES = [
  'NEW',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'QUOTED',
  'QUOTE_ACCEPTED',
  'DIGITIZING',
  'DESIGN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;
export type CustomRequestState = (typeof CUSTOM_REQUEST_STATES)[number];

export const customRequests = pgTable(
  'custom_requests',
  {
    id: idColumn().notNull(),
    code: text('code').notNull(),
    customerId: idReference('customer_id').notNull(),
    status: stateColumn().notNull(),
    productId: idReference('product_id'),
    productVariantId: idReference('product_variant_id'),
    customerNote: text('customer_note'),
    currentDesignCaseId: idReference('current_design_case_id'),
    currentQuotationId: idReference('current_quotation_id'),
    cancelledReason: text('cancelled_reason'),
    cancelledCustomerReason: text('cancelled_customer_reason'),
    submittedSessionId: idReference('submitted_session_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_custom_requests', columns: [t.id] }),
    // CST-026 / IDX-028 — human request code identity (Q-15/Q-21 lookup).
    unique('uq_custom_requests__code').on(t.code),
    // REL-060 — customers are anonymize-class; the request survives scrub.
    foreignKey({
      name: 'fk_custom_requests__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    // REL-061 ×2 — store-product subject; catalog rows are archive-only.
    foreignKey({
      name: 'fk_custom_requests__product_id',
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_custom_requests__product_variant_id',
      columns: [t.productVariantId],
      foreignColumns: [productVariants.id],
    }).onDelete('restrict'),
    // REL-062 pointer FKs are NOT declared here — both design_cases and
    // quotations would be module cycles; the design_cases FK was added by
    // custom SQL in this group's migration, and the quotations FK by custom
    // SQL in G14's migration once that table existed.
    check('ck_custom_requests__status_allowed', stateCheck(t.status, CUSTOM_REQUEST_STATES)),
    // IDX-073 / Q-21/Q-22 — admin queue: equality on status leads, sort
    // (created_at DESC, id DESC) matches the query direction exactly.
    index('ix_custom_requests__status_created_id').on(t.status, t.createdAt.desc(), t.id.desc()),
  ],
);
