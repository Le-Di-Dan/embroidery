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

/**
 * The fixed APP2 category taxonomy (IMP-D032, provisioned by migration 0033).
 *
 * `products.category_id` is NOT NULL with no default, and APP2 ships no
 * category management API, so these four rows are reference data rather than
 * operator-created content. The slug — not the physical UUID — is the stable
 * public key: it is what `APP2-B02` accepts on the wire and what the generated
 * client exposes as a closed enum, so no Admin surface ever has to learn a
 * category id to file a draft.
 *
 * This is the single source for the set. The migration, the OpenAPI enum, the
 * repository lookup and the Admin labels all derive from it; a second copy is
 * how a taxonomy silently forks.
 *
 * The table models categories **flat** (no parent column), so every entry is a
 * root category by construction — rootness needs no stored value.
 */
export interface App2CategoryDefinition {
  /** Deterministic id, fixed in migration 0033 and identical on every machine. */
  readonly id: string;
  /** Stable APP2 reference key; immutable, and the value used on the wire. */
  readonly slug: string;
  /** Canonical Vietnamese display label. */
  readonly name: string;
  readonly displayOrder: number;
}

export const APP2_CATEGORY_TAXONOMY: readonly App2CategoryDefinition[] = [
  {
    id: '019a0000-0000-7000-8000-000000000001',
    slug: 'thu-bong',
    name: 'Thú bông',
    displayOrder: 10,
  },
  { id: '019a0000-0000-7000-8000-000000000002', slug: 'khan', name: 'Khăn', displayOrder: 20 },
  {
    id: '019a0000-0000-7000-8000-000000000003',
    slug: 'quan-ao',
    name: 'Quần áo',
    displayOrder: 30,
  },
  { id: '019a0000-0000-7000-8000-000000000004', slug: 'khac', name: 'Khác', displayOrder: 90 },
] as const;

/** The closed slug set, in canonical display order — the OpenAPI enum source. */
export const APP2_CATEGORY_SLUGS = ['thu-bong', 'khan', 'quan-ao', 'khac'] as const;
export type App2CategorySlug = (typeof APP2_CATEGORY_SLUGS)[number];

/**
 * The status the provisioned taxonomy carries. The lifecycle has no `ACTIVE`
 * literal, so "active" maps onto the existing closed set as `PUBLISHED`:
 * `ARCHIVED` is the delisted state and `DRAFT` is not yet active.
 */
export const APP2_CATEGORY_STATUS = 'PUBLISHED' as const satisfies CategoryState;

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
