/**
 * TBL-050 `quotations` — the quotation header of one request: current-
 * version pointer + lifecycle state (CTX-QUO, AGG-14, `root`/header).
 *
 * Columns: COL-TBL050-01..04 · Constraints: CST-001, CST-035 (IDX-037,
 * IDX-038)
 * Relationships: REL-065 (→ custom_requests, 1–1, restrict), REL-068
 * (current_version_id → quotation_versions — **implemented in this group**
 * by custom SQL, same header↔child cycle class as REL-044/0016 and
 * REL-098/0019: declaring it here would need a circular module import)
 * Indexes: IDX-037 (constraint-created), IDX-038 (constraint-created)
 * Owner: Quotation module.
 *
 * **Header semantics** (DB4 Mut: header, LC-12): this row owns identity, the
 * 1–1 request linkage and the current-version pointer only; every priced
 * fact lives on `quotation_versions`. `code` and `custom_request_id` are
 * each independently unique (CST-035): one quotation per request, and a
 * stable human-facing code.
 *
 * `current_version_id` existence is enforced by a physical FK (added by
 * custom SQL, mirroring `0016_add_design_case_current_version_fk.sql` and
 * `0019_add_agreement_current_version_fk.sql`). Same-quotation ownership of
 * the pointed-to version is **not** a database-level guard — REL-068 is
 * documented "TX consistency" in `DB4_RELATIONSHIP_AND_FK_MODEL.md`, the
 * same classification tier as REL-044/REL-098; the send/accept transaction
 * that advances this pointer is the owner, not a trigger or composite FK.
 */
import { check, foreignKey, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { customRequests } from '../ordering/custom-requests';

/** LC-12 header states. Canonical source — see DB3 §"LC-12 / LC-13". */
export const QUOTATION_STATES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'EXPIRED',
  'REJECTED',
  'CANCELLED',
] as const;
export type QuotationState = (typeof QUOTATION_STATES)[number];

export const quotations = pgTable(
  'quotations',
  {
    id: idColumn().notNull(),
    code: text('code').notNull(),
    customRequestId: idReference('custom_request_id').notNull(),
    status: stateColumn().notNull(),
    currentVersionId: idReference('current_version_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_quotations', columns: [t.id] }),
    // CST-035 / IDX-038 — stable human-facing quotation code.
    unique('uq_quotations__code').on(t.code),
    // CST-035 / IDX-037 — one quotation header per request (1–1).
    unique('uq_quotations__request').on(t.customRequestId),
    // REL-065 — requests are retain-class, so restrict is safe.
    foreignKey({
      name: 'fk_quotations__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    // REL-068 current_version_id FK added by custom SQL — see this group's
    // migration (circular-import cycle with quotation-versions.ts otherwise).
    check('ck_quotations__status_allowed', stateCheck(t.status, QUOTATION_STATES)),
  ],
);
