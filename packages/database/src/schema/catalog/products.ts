/**
 * TBL-012 `products` — one store product (CTX-CAT, AGG-06).
 *
 * Columns: COL-TBL012-01..13 · Constraints: CST-001, CST-011 (IDX-011),
 * CST-060 (LC-04), CST-063 (base price ≥ 0), CST-068 (currency closed set),
 * DEV-DB6-005 (VND integer scale)
 * Relationships: REL-020 (→ categories)
 * Indexes: IDX-011 (constraint-created), IDX-065 (P0, with group)
 * Owner: Catalog module.
 *
 * `base_price_amount` is the **display** base price only. Commercial history
 * never references it (INV-12): quotation versions and order items copy money
 * by value at their commercial boundary, so editing this price mutates no
 * snapshot. The MVP currency set is closed to VND (ADR-DB4-001 r3, CST-068);
 * widening it later is a plain migration on the CHECK, not a model change.
 *
 * `is_display_out_of_stock` is DB4's **manual availability override** (LC-05:
 * override OUT wins, it can never force AVAILABLE). It is not derived stock —
 * real availability is computed in the Inventory context, and no stock
 * quantity exists anywhere in Catalog.
 *
 * IDX-065's partial predicate `status='PUBLISHED'` is also the Q-01 security
 * scope: DRAFT/ARCHIVED rows are structurally absent from the public listing
 * index. Slug uniqueness stays global (technical identity), deliberately not
 * scoped to published rows.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import {
  amount,
  currencyCode,
  currencyScaleCheck,
  nonNegativeAmountCheck,
} from '../../primitives/money';
import { categories } from './categories';

/** LC-04 (DB3 handoff §1 publication set). */
export const PRODUCT_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ProductState = (typeof PRODUCT_STATES)[number];

export const products = pgTable(
  'products',
  {
    id: idColumn().notNull(),
    categoryId: idReference('category_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    basePriceAmount: amount('base_price_amount').notNull(),
    currencyCode: currencyCode().notNull(),
    status: stateColumn().notNull(),
    archivedAt: instant('archived_at'),
    isDisplayOutOfStock: boolean('is_display_out_of_stock').notNull(),
    displayOrder: integer('display_order').notNull(),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    isIndexable: boolean('is_indexable').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_products', columns: [t.id] }),
    // CST-011 / IDX-011 — global slug identity (Q-02 detail lookup).
    unique('uq_products__slug').on(t.slug),
    // REL-020 — archive of a category only delists; never orphans a product.
    foreignKey({
      name: 'fk_products__category_id',
      columns: [t.categoryId],
      foreignColumns: [categories.id],
    }).onDelete('restrict'),
    check('ck_products__status_allowed', stateCheck(t.status, PRODUCT_STATES)),
    // CST-063 instance — a display price is never negative.
    check('ck_products__base_price_non_negative', nonNegativeAmountCheck(t.basePriceAmount)),
    // CST-068 instance — MVP closed currency set.
    check('ck_products__currency_allowed', sql`${t.currencyCode} = 'VND'`),
    // DEV-DB6-005 — VND has no minor unit.
    check('ck_products__currency_scale', currencyScaleCheck(t.basePriceAmount, t.currencyCode)),
    // IDX-065 — Q-01/Q-06 published listing; equality lives in the predicate,
    // sort is (display_order, id) per ADR-DB5-001.
    index('ix_products__category_display_id__published')
      .on(t.categoryId, t.displayOrder, t.id)
      .where(sql`${t.status} = 'PUBLISHED'`),
  ],
);
