/**
 * TBL-035 `design_template_versions` — one published (or draft) template
 * document version (CTX-DSN, AGG-12, `ver`).
 *
 * Columns: COL-TBL035-01..05 · Constraints: CST-001, CST-025 (IDX-027)
 * Relationships: REL-056 (→ design_templates)
 * Indexes: IDX-027 (constraint-created)
 * JSONB: payload #3 `design_document`, version key `document_schema_version`
 * Owner: Design module.
 *
 * **Immutable once published** (S24 reject-mutation trigger target): the
 * document and its schema version freeze at publish, `published_at` is
 * immutable once set, and clones stamp `(template, version)` — so a
 * historical version can always reproduce exactly what a customer cloned.
 * Per the `ver`-category convention there is no `updated_at`; the only
 * mutation window is the pre-publish draft, and the S24 trigger will scope
 * on `published_at IS NOT NULL`.
 *
 * The document carries **no hash column** — DB4's JSONB map #3 marks it
 * JCS-capable but assigns no stored hash (hashing is the formal
 * design-version flow's concern, G11), and none is invented here.
 */
import { foreignKey, integer, jsonb, pgTable, primaryKey, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { designTemplates } from './design-templates';

export const designTemplateVersions = pgTable(
  'design_template_versions',
  {
    id: idColumn().notNull(),
    designTemplateId: idReference('design_template_id').notNull(),
    version: integer('version').notNull(),
    designDocument: jsonb('design_document').notNull(),
    documentSchemaVersion: integer('document_schema_version').notNull(),
    publishedAt: instant('published_at'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_design_template_versions', columns: [t.id] }),
    // CST-025 / IDX-027 — version numbers are per-template and never reused.
    unique('uq_design_template_versions__template_version').on(t.designTemplateId, t.version),
    // REL-056 — versions are composed under their root and never deleted.
    foreignKey({
      name: 'fk_design_template_versions__design_template_id',
      columns: [t.designTemplateId],
      foreignColumns: [designTemplates.id],
    }).onDelete('restrict'),
  ],
);
