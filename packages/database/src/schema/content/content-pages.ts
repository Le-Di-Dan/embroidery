/**
 * TBL-066 `content_pages` — one SEO/content page: home/service/FAQ/local/
 * landing/policy (CTX-CNT, AGG-19, `root`).
 *
 * Columns: COL-TBL066-01..09 · Constraints: CST-001, CST-044 instance
 * (IDX-052, `(page_type, slug)`), CST-060 (LC-04)
 * Relationships: none (standalone content row)
 * Indexes: IDX-052 (constraint-created), IDX-067 (P0, sitemap/publication
 * scan)
 * Owner: Content module.
 *
 * **No version history in MVP** (DB2 explicit non-goal) — `body` is
 * mutable rendered content; edits are audited (before/after summaries),
 * not versioned rows, unlike `agreement_versions`. `body` is never indexed
 * (no query filters on it; a full-text index would be speculative,
 * ADR-DB5-002 R6).
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';

/** LC-04 (DB3 handoff §1 publication set). */
export const CONTENT_PAGE_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ContentPageState = (typeof CONTENT_PAGE_STATES)[number];

/** COL-TBL066-01 closed page-type set (DB4). */
export const CONTENT_PAGE_TYPES = ['HOME', 'SERVICE', 'FAQ', 'LOCAL', 'LANDING', 'POLICY'] as const;
export type ContentPageType = (typeof CONTENT_PAGE_TYPES)[number];

export const contentPages = pgTable(
  'content_pages',
  {
    id: idColumn().notNull(),
    pageType: text('page_type').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    status: stateColumn().notNull(),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    isIndexable: boolean('is_indexable').notNull(),
    archivedAt: instant('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_content_pages', columns: [t.id] }),
    // CST-044 instance / IDX-052 — Q-05 page lookup; ambiguous route otherwise.
    unique('uq_content_pages__page_type_slug').on(t.pageType, t.slug),
    check('ck_content_pages__page_type_allowed', stateCheck(t.pageType, CONTENT_PAGE_TYPES)),
    check('ck_content_pages__status_allowed', stateCheck(t.status, CONTENT_PAGE_STATES)),
    // IDX-067 — Q-06 sitemap scan; structurally excludes DRAFT/ARCHIVED and
    // non-indexable rows, same pattern as IDX-065/066.
    index('ix_content_pages__published_indexable')
      .on(t.id)
      .where(sql`${t.status} = 'PUBLISHED' and ${t.isIndexable}`),
  ],
);
