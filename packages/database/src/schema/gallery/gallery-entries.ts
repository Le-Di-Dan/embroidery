/**
 * TBL-064 `gallery_entries` — one published showcase entry: SEO text +
 * ordering, optional product link (CTX-GAL, AGG-18, `root`).
 *
 * Columns: COL-TBL064-01..10 · Constraints: CST-001, CST-011 (IDX-012),
 * CST-060 (LC-04)
 * Relationships: REL-096 (→ products, optional SEO link, set-null-cand,
 * no index — DB5 catalog rejection entry R15, table is tiny)
 * Indexes: IDX-012 (constraint-created), IDX-066 (P0, publication listing)
 * Owner: Gallery module.
 *
 * Publication reuses the LC-04 pattern already used by `products`/
 * `content_pages`: state lives in the CHECK, the partial predicate on
 * IDX-066 carries the public-listing security scope (DRAFT/ARCHIVED never
 * appear there), and `archived_at` is evidence only, never a filter.
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
import { products } from '../catalog/products';

/** LC-04 (DB3 handoff §1 publication set). */
export const GALLERY_ENTRY_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type GalleryEntryState = (typeof GALLERY_ENTRY_STATES)[number];

export const galleryEntries = pgTable(
  'gallery_entries',
  {
    id: idColumn().notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull(),
    status: stateColumn().notNull(),
    displayOrder: integer('display_order').notNull(),
    linkedProductId: idReference('linked_product_id'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    isIndexable: boolean('is_indexable').notNull(),
    archivedAt: instant('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_gallery_entries', columns: [t.id] }),
    // CST-011 / IDX-012 — gallery URL identity.
    unique('uq_gallery_entries__slug').on(t.slug),
    // REL-096 — optional SEO link; a delisted/archived product must not
    // orphan the entry, so the relationship is nullable set-null-candidate
    // (App owns the actual null-out on product retirement, per DB4).
    foreignKey({
      name: 'fk_gallery_entries__linked_product_id',
      columns: [t.linkedProductId],
      foreignColumns: [products.id],
    }).onDelete('set null'),
    check('ck_gallery_entries__status_allowed', stateCheck(t.status, GALLERY_ENTRY_STATES)),
    // IDX-066 — published listing; equality lives in the predicate, sort is
    // (display_order, id) per ADR-DB5-001, same shape as IDX-065.
    index('ix_gallery_entries__display_id__published')
      .on(t.displayOrder, t.id)
      .where(sql`${t.status} = 'PUBLISHED'`),
  ],
);
