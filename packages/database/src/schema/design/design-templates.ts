/**
 * TBL-034 `design_templates` — one store-authored design template: header,
 * optional catalog scope, publication state (CTX-DSN, AGG-12).
 *
 * Columns: COL-TBL034-01..08 (-04 ×3) · Constraints: CST-001, CST-011
 * (IDX-013), CST-060 (publication set)
 * Relationships: REL-057 (first edge — → asset_derivatives, preview),
 * REL-058 ×3 (→ products / product_sides / embroidery_areas, optional scope)
 * Indexes: IDX-013 (constraint-created)
 * Owner: Design module.
 *
 * **Clone-on-use** (GRD-028): a session copies the published version's
 * document at clone time and stamps `(template_id, template_version)` as
 * provenance — there is no live link, so editing this header or publishing a
 * new version never mutates existing sessions or designs.
 *
 * `current_version` is an integer counter bumped per publish (COL-TBL034-06)
 * — deliberately *not* a version-row FK, so no header↔version cycle exists
 * for this aggregate. Scope (REL-058) is `set-null-cand` in DB4: the targets
 * are archive-only (never hard-deleted), so `restrict` is the safe physical
 * choice and clearing the pointer stays an app operation — same convention
 * as REL-033's customers edge in G4.
 */
import { check, foreignKey, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { assetDerivatives } from '../asset/asset-derivatives';
import { products } from '../catalog/products';
import { productSides } from '../catalog/product-sides';
import { embroideryAreas } from '../catalog/embroidery-areas';

/** Publication set (DB3 handoff §1). */
export const DESIGN_TEMPLATE_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type DesignTemplateState = (typeof DESIGN_TEMPLATE_STATES)[number];

export const designTemplates = pgTable(
  'design_templates',
  {
    id: idColumn().notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    productId: idReference('product_id'),
    productSideId: idReference('product_side_id'),
    embroideryAreaId: idReference('embroidery_area_id'),
    status: stateColumn().notNull(),
    currentVersion: integer('current_version').notNull(),
    previewDerivativeId: idReference('preview_derivative_id'),
    archivedAt: instant('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_design_templates', columns: [t.id] }),
    // CST-011 / IDX-013 — public listing identity.
    unique('uq_design_templates__slug').on(t.slug),
    // REL-058 ×3 — optional scope; all three targets are archive-only.
    foreignKey({
      name: 'fk_design_templates__product_id',
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_templates__product_side_id',
      columns: [t.productSideId],
      foreignColumns: [productSides.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_templates__embroidery_area_id',
      columns: [t.embroideryAreaId],
      foreignColumns: [embroideryAreas.id],
    }).onDelete('restrict'),
    // REL-057 (first edge) — public listing preview is a watermark-safe
    // derivative, never the private original.
    foreignKey({
      name: 'fk_design_templates__preview_derivative_id',
      columns: [t.previewDerivativeId],
      foreignColumns: [assetDerivatives.id],
    }).onDelete('restrict'),
    check('ck_design_templates__status_allowed', stateCheck(t.status, DESIGN_TEMPLATE_STATES)),
  ],
);
