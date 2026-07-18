/**
 * TBL-016 `embroidery_areas` — one allowed embroidery region on a product
 * side (CTX-CAT, AGG-06).
 *
 * Columns: COL-TBL016-01..07 (-03 ×2, -04 ×2 → 9 business columns)
 * Constraints: CST-001, CST-066 (px bounds > 0; max mm > 0 when set)
 * Relationships: REL-023 (second edge — → product_sides)
 * Indexes: IDX-071 (P1 required, with group)
 * Owner: Catalog module.
 *
 * Bounds are canvas-space: origin (`bound_x_px`, `bound_y_px`) plus extent.
 * DB4's CST-066 covers extents (`> 0`) and the optional physical maxima
 * (`> 0` when set); the origin carries no CHECK — 0 is a valid origin, and
 * whether the area fits *inside* its side's canvas is a cross-row fact that
 * stays a TX/App guard (no fake CHECK is invented for it). No 3D data exists;
 * the product scope dropped 3D.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { productSides } from './product-sides';

export const embroideryAreas = pgTable(
  'embroidery_areas',
  {
    id: idColumn().notNull(),
    productSideId: idReference('product_side_id').notNull(),
    name: text('name').notNull(),
    boundXPx: numeric('bound_x_px').notNull(),
    boundYPx: numeric('bound_y_px').notNull(),
    boundWidthPx: numeric('bound_width_px').notNull(),
    boundHeightPx: numeric('bound_height_px').notNull(),
    maxWidthMm: numeric('max_width_mm'),
    maxHeightMm: numeric('max_height_mm'),
    displayOrder: integer('display_order').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_embroidery_areas', columns: [t.id] }),
    foreignKey({
      name: 'fk_embroidery_areas__product_side_id',
      columns: [t.productSideId],
      foreignColumns: [productSides.id],
    }).onDelete('restrict'),
    // CST-066 instances.
    check(
      'ck_embroidery_areas__bounds_positive',
      sql`${t.boundWidthPx} > 0 and ${t.boundHeightPx} > 0`,
    ),
    check(
      'ck_embroidery_areas__max_mm_positive',
      sql`${t.maxWidthMm} > 0 and ${t.maxHeightMm} > 0`,
    ),
    // IDX-071 — Q-02 areas-by-side in display order.
    index('ix_embroidery_areas__side_display').on(t.productSideId, t.displayOrder),
  ],
);
