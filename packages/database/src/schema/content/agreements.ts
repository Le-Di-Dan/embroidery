/**
 * TBL-068 `agreements` — the agreement container of one policy type
 * (CTX-CNT, AGG-21, `header`).
 *
 * Columns: COL-TBL068-01..03 · Constraints: CST-001, CST-044 instance
 * (IDX-054)
 * Relationships: REL-098 (current_version_id → agreement_versions —
 * **implemented in this group** by custom SQL, same header↔child cycle
 * class as REL-044/0016: declaring it here would need a circular module
 * import)
 * Indexes: IDX-054 (constraint-created)
 * Owner: Content module.
 *
 * **Header semantics** (DB4 Mut: header): this row owns identity and the
 * current-version pointer only; every legal fact (content, hash, effective
 * window) lives on `agreement_versions`. The type set is config-extensible
 * — DB4 deliberately puts no CHECK on it (payment/return/delivery/privacy
 * today, more additive later).
 *
 * `current_version_id` existence is enforced by a physical FK (added by
 * custom SQL, mirroring `0016_add_design_case_current_version_fk.sql`).
 * Same-agreement ownership of the pointed-to version is **not** a
 * database-level guard — REL-098 is documented "TX consistency" in
 * `DB4_RELATIONSHIP_AND_FK_MODEL.md`, the same classification tier as
 * REL-044 (`design_cases.current_version_id`); the publish transaction
 * that advances this pointer is the owner (GRD-008 direction), not a
 * trigger or composite FK.
 */
import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

export const agreements = pgTable(
  'agreements',
  {
    id: idColumn().notNull(),
    agreementType: text('agreement_type').notNull(),
    name: text('name').notNull(),
    currentVersionId: idReference('current_version_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_agreements', columns: [t.id] }),
    // CST-044 instance / IDX-054 — one container per policy type.
    unique('uq_agreements__agreement_type').on(t.agreementType),
    // REL-098 current_version_id FK added by custom SQL — see this group's
    // migration (circular-import cycle with agreement-versions.ts otherwise).
  ],
);
