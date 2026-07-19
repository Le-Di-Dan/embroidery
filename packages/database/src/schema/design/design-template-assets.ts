/**
 * TBL-036 `design_template_assets` — one template↔private-artwork-asset
 * association (CTX-DSN, AGG-12, `assoc`).
 *
 * Columns: COL-TBL036-01..02 · Constraints: CST-001, CST-043 (IDX-049)
 * Relationships: REL-057 (second + third edges — → design_templates, → assets)
 * Indexes: IDX-049 (constraint-created; `design_template_id` prefix serves
 * assets-by-template)
 * Owner: Design module — the association only; Asset owns the metadata.
 *
 * These are the template's **private originals** (REQ-TMPL-002): the public
 * listing shows only the watermarked preview derivative on the template
 * header. Associating an original here never makes it public.
 */
import { foreignKey, pgTable, primaryKey, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { assets } from '../asset/assets';
import { designTemplates } from './design-templates';

export const designTemplateAssets = pgTable(
  'design_template_assets',
  {
    id: idColumn().notNull(),
    designTemplateId: idReference('design_template_id').notNull(),
    assetId: idReference('asset_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_design_template_assets', columns: [t.id] }),
    // CST-043 / IDX-049 — one association per (template, asset).
    unique('uq_design_template_assets__template_asset').on(t.designTemplateId, t.assetId),
    foreignKey({
      name: 'fk_design_template_assets__design_template_id',
      columns: [t.designTemplateId],
      foreignColumns: [designTemplates.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_template_assets__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
  ],
);
