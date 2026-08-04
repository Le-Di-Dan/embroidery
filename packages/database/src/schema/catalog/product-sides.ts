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
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { assets } from '../asset/assets';
import { products } from './products';

/**
 * Stable machine identity inside one parent (APP3-G01 PO-06, IMP-D041).
 *
 * A referenced placement is never edited in place and never hard-deleted; it is
 * retired and superseded by a replacement row. That makes `name` unusable as
 * identity — it is display copy, localized and freely edited — so `code` is the
 * value a Template, Session or snapshot means when it says "the front side".
 */
export const PLACEMENT_CODE_PATTERN = '^[a-z0-9][a-z0-9_-]{0,63}$';

export const productSides = pgTable(
  'product_sides',
  {
    id: idColumn().notNull(),
    productId: idReference('product_id').notNull(),
    code: text('code').notNull(),
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
    retiredAt: instant('retired_at'),
    supersededById: idReference('superseded_by_id'),
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
    // APP3-DB01 — the replacement is another side of the same Product. The
    // same-parent half is a cross-row fact and lives in the S24-style guard
    // trigger; the FK is what stops the pointer dangling.
    foreignKey({
      name: 'fk_product_sides__superseded_by_id',
      columns: [t.supersededById],
      foreignColumns: [t.id],
    }).onDelete('restrict'),
    // Identity is unique per Product, never globally: two Products may both
    // have a `front`.
    unique('uq_product_sides__product_code').on(t.productId, t.code),
    check(
      'ck_product_sides__code_format',
      sql`${t.code} ~ ${sql.raw(`'${PLACEMENT_CODE_PATTERN}'`)}`,
    ),
    // A replacement pointer on a live row would mean "superseded but still
    // selectable", which no reader could act on.
    check(
      'ck_product_sides__superseded_requires_retired',
      sql`${t.supersededById} is null or ${t.retiredAt} is not null`,
    ),
    check(
      'ck_product_sides__superseded_not_self',
      sql`${t.supersededById} is null or ${t.supersededById} <> ${t.id}`,
    ),
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
