/**
 * TBL-001 `admin_accounts` — single-operator admin identity (CTX-IDN).
 *
 * Columns: COL-TBL001-01..06 · Constraints: CST-001, CST-002, CST-003, CST-060
 * Relationships: REL — self-reference `replaced_by_admin_account_id`
 * Indexes: IDX-001 (`uq_admin_accounts__email`),
 *          IDX-002 (`uq_admin_accounts__status__active`)
 * Owner: Identity module.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';

/** DB3 state set for TBL-001. Canonical source — see DB5-A09. */
export const ADMIN_ACCOUNT_STATES = ['ACTIVE', 'LOCKED', 'DISABLED'] as const;
export type AdminAccountState = (typeof ADMIN_ACCOUNT_STATES)[number];

export const adminAccounts = pgTable(
  'admin_accounts',
  {
    id: idColumn().notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    status: stateColumn().notNull(),
    lockedAt: instant('locked_at'),
    disabledAt: instant('disabled_at'),
    replacedByAdminAccountId: idReference('replaced_by_admin_account_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // CST-001 — explicit name; the inline .primaryKey() shorthand would emit a
    // tool-generated `admin_accounts_pkey` (DEV-DB6-006).
    primaryKey({ name: 'pk_admin_accounts', columns: [t.id] }),
    // CST-002 / IDX-001 — one admin identity per email.
    unique('uq_admin_accounts__email').on(t.email),
    // CST-003 / IDX-002 — at most one ACTIVE admin (REQ-IDN-001). A partial
    // unique index on a constant-valued predicate: every ACTIVE row collides on
    // the same key, so the second one is rejected by the database rather than
    // by a check-then-write race in the replacement procedure.
    uniqueIndex('uq_admin_accounts__status__active')
      .on(t.status)
      .where(sql`${t.status} = 'ACTIVE'`),
    // REL-003 — successor chain on replacement (LC-01). Self-referencing,
    // nullable, `restrict`: a replaced account is retained as evidence, so the
    // predecessor row must never be deletable out from under the pointer.
    foreignKey({
      name: 'fk_admin_accounts__replaced_by_admin_account_id',
      columns: [t.replacedByAdminAccountId],
      foreignColumns: [t.id],
    }).onDelete('restrict'),
    // CST-060 — status set from DB3.
    check('ck_admin_accounts__status', stateCheck(t.status, ADMIN_ACCOUNT_STATES)),
  ],
);
