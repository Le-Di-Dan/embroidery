/**
 * TBL-013 `product_variants` — one color/size variant of a product
 * (CTX-CAT, AGG-06).
 *
 * Columns: COL-TBL013-01..05 · Constraints: CST-001
 * Relationships: REL-021 (→ products, composition)
 * Indexes: IDX-068 (P1 required, with group)
 * Owner: Catalog module.
 *
 * Attributes are the two relational columns DB4 locked (`color_name`,
 * `size_label`) — no EAV, no attribute JSONB. `is_active` delists a variant
 * without archiving it; history is safe either way because commercial
 * snapshots copy by value (REL-021 "history via snapshots").
 */
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { products } from './products';

export const productVariants = pgTable(
  'product_variants',
  {
    id: idColumn().notNull(),
    productId: idReference('product_id').notNull(),
    colorName: text('color_name'),
    sizeLabel: text('size_label'),
    displayOrder: integer('display_order').notNull(),
    isActive: boolean('is_active').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_product_variants', columns: [t.id] }),
    foreignKey({
      name: 'fk_product_variants__product_id',
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete('restrict'),
    // IDX-068 — Q-02 children-by-product in display order.
    index('ix_product_variants__product_display').on(t.productId, t.displayOrder),
  ],
);
