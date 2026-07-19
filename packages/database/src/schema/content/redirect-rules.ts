/**
 * TBL-067 `redirect_rules` — one path→target redirect (CTX-CNT, AGG-20,
 * `root`).
 *
 * Columns: COL-TBL067-01..04 · Constraints: CST-001, CST-044 instance
 * (IDX-053)
 * Relationships: none
 * Indexes: IDX-053 (constraint-created)
 * Owner: Content module.
 *
 * Q-07's `is_active` partial index was **rejected** (DB5 catalog rejection
 * entry R05): the unique probe on `source_path` returns exactly one row,
 * and testing a boolean on that row is free — a partial index would add
 * write cost and serve nothing.
 */
import { pgTable, primaryKey, text, unique, boolean, check } from 'drizzle-orm/pg-core';

import { idColumn } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';

/** COL-TBL067-03 closed redirect-kind set (DB4). */
export const REDIRECT_KINDS = ['PERMANENT', 'TEMPORARY'] as const;
export type RedirectKind = (typeof REDIRECT_KINDS)[number];

export const redirectRules = pgTable(
  'redirect_rules',
  {
    id: idColumn().notNull(),
    sourcePath: text('source_path').notNull(),
    targetPath: text('target_path').notNull(),
    redirectKind: text('redirect_kind').notNull(),
    isActive: boolean('is_active').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_redirect_rules', columns: [t.id] }),
    // CST-044 instance / IDX-053 — Q-07 redirect lookup; ambiguous route otherwise.
    unique('uq_redirect_rules__source_path').on(t.sourcePath),
    check('ck_redirect_rules__kind_allowed', stateCheck(t.redirectKind, REDIRECT_KINDS)),
  ],
);
