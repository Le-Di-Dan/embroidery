/**
 * TBL-027 `design_cases` — the design thread (case header) of one custom
 * request (CTX-DSN, AGG-10, `root`/header).
 *
 * Columns: COL-TBL027-01..02 · Constraints: CST-001, CST-020 (IDX-022)
 * Relationships: REL-043 (→ custom_requests, 1–1), REL-044
 * (current_version_id → design_versions — **deferred, owner G11**: the
 * version table does not exist yet; nullable pointer present now, FK follows
 * the header-pointer pattern)
 * Indexes: IDX-022 (constraint-created)
 * Owner: Design module — a separate workflow aggregate, never collapsed
 * into the request.
 *
 * **Header semantics** (DB4 Mut: header): this row owns identity and
 * pointers only. It has no status column — the case's observable state is
 * derived from its versions/reviews (G11), and the request's LC-11 status is
 * never aliased here. CST-020 locks the 1–1 cardinality: exactly one design
 * thread per request, created inside the submission/design transaction
 * (TX-owned), never by a trigger.
 *
 * The reverse pointer `custom_requests.current_design_case_id` (REL-062)
 * completes a header↔child cycle, so it is added by reviewed custom SQL in
 * this group's migration — the same mechanism as REL-102 (0004) and REL-033
 * (0010). Versions/reviews/approval structures belong to G11/G13 and are
 * not touched here.
 */
import { foreignKey, pgTable, primaryKey, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { customRequests } from '../ordering/custom-requests';

export const designCases = pgTable(
  'design_cases',
  {
    id: idColumn().notNull(),
    customRequestId: idReference('custom_request_id').notNull(),
    currentVersionId: idReference('current_version_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_design_cases', columns: [t.id] }),
    // CST-020 / IDX-022 — one design thread per request (1–1).
    unique('uq_design_cases__request').on(t.customRequestId),
    // REL-043 — the case must outlive session TTLs and customer scrubs;
    // requests are retain-class, so restrict is safe.
    foreignKey({
      name: 'fk_design_cases__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    // REL-044 current_version_id FK lands with G11 (design_versions).
  ],
);
