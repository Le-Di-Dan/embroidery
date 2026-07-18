/**
 * TBL-011 `categories` — one product category, SEO-capable (CTX-CAT, AGG-05).
 *
 * Columns: COL-TBL011-01..09 · Constraints: CST-001, CST-011 (IDX-010),
 * CST-060 (publication set)
 * Relationships: none outbound — DB4 models categories **flat**; there is no
 * parent column and no tree, so no self-parent/cycle machinery exists to need
 * guarding.
 * Indexes: IDX-010 (constraint-created)
 * Owner: Catalog module.
 *
 * `slug` is a technical exact identifier: unique globally (not only when
 * published), compared bytewise under the `C` baseline. Archiving a category
 * only delists it — products keep their FK (REL-020 `restrict`).
 */
import { check, pgTable, primaryKey, text, unique, integer, boolean } from 'drizzle-orm/pg-core';

import { idColumn } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';

/** Publication set (DB3 handoff §1: Product/Category/Gallery/Content/Template). */
export const CATEGORY_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type CategoryState = (typeof CATEGORY_STATES)[number];

export const categories = pgTable(
  'categories',
  {
    id: idColumn().notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    displayOrder: integer('display_order').notNull(),
    status: stateColumn().notNull(),
    archivedAt: instant('archived_at'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    isIndexable: boolean('is_indexable').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_categories', columns: [t.id] }),
    // CST-011 / IDX-010 — global slug identity, publication-independent.
    unique('uq_categories__slug').on(t.slug),
    check('ck_categories__status_allowed', stateCheck(t.status, CATEGORY_STATES)),
  ],
);
