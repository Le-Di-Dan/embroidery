/**
 * TBL-015 `product_sides` — one embroiderable side of a product: background
 * image plus px↔mm coordinate mapping (CTX-CAT, AGG-06).
 *
 * Columns: COL-TBL015-01..09 · Constraints: CST-001, CST-066 (5 geometry
 * checks) · Relationships: REL-023 (first edge — → products), REL-024
 * (→ assets, background)
 * Indexes: IDX-070 (P1 required, with group)
 * Owner: Catalog module. Designer *placement* state lives in design sessions
 * (G7), never here — this row is store-authored geometry only.
 *
 * The background is a direct asset reference (ADR-DB4-003); tombstoning that
 * asset is coordinated with this FK (`restrict`), so a side can never point
 * at a deleted binary. `px_per_mm` (CON-029) is the canvas↔physical mapping
 * every embroidery-area bound depends on.
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
import { assets } from '../asset/assets';
import { products } from './products';

export const productSides = pgTable(
  'product_sides',
  {
    id: idColumn().notNull(),
    productId: idReference('product_id').notNull(),
    name: text('name').notNull(),
    backgroundAssetId: idReference('background_asset_id').notNull(),
    imageWidthPx: integer('image_width_px').notNull(),
    imageHeightPx: integer('image_height_px').notNull(),
    // Bare `numeric` — DB4 locks dimensions without precision (measurement
    // model §4); adding one here would be an invented physical decision.
    physicalWidthMm: numeric('physical_width_mm').notNull(),
    physicalHeightMm: numeric('physical_height_mm').notNull(),
    pxPerMm: numeric('px_per_mm').notNull(),
    displayOrder: integer('display_order').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_product_sides', columns: [t.id] }),
    foreignKey({
      name: 'fk_product_sides__product_id',
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete('restrict'),
    // REL-024 — background binary must outlive every side that shows it.
    foreignKey({
      name: 'fk_product_sides__background_asset_id',
      columns: [t.backgroundAssetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
    // CST-066 instances — non-physical geometry is rejected at the row.
    check(
      'ck_product_sides__image_px_positive',
      sql`${t.imageWidthPx} > 0 and ${t.imageHeightPx} > 0`,
    ),
    check(
      'ck_product_sides__physical_mm_positive',
      sql`${t.physicalWidthMm} > 0 and ${t.physicalHeightMm} > 0`,
    ),
    check('ck_product_sides__px_per_mm_positive', sql`${t.pxPerMm} > 0`),
    // IDX-070 — Q-02 sides-by-product in display order.
    index('ix_product_sides__product_display').on(t.productId, t.displayOrder),
  ],
);
