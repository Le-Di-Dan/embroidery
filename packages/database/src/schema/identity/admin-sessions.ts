/**
 * TBL-003 `admin_sessions` — hashed-token, revocable admin session (CTX-IDN).
 *
 * Columns: COL-TBL003-01..06 · Constraints: CST-001, CST-004, CST-060
 * Relationships: REL — `admin_account_id` → `admin_accounts`
 * Indexes: IDX-003 (`uq_admin_sessions__token_hash`)
 * Owner: Identity module.
 *
 * `token_hash` stores a hash only — never the session token (D7-12). It is the
 * lookup key for every authenticated admin request, so its unique index is a
 * security path, not an optimization (DB5 §2).
 *
 * `expires_at` is a plain column and is compared against `now()` *in the
 * query*. It is deliberately not part of an index predicate: PostgreSQL rejects
 * `now()` there outright, and a predicate that drifts with wall-clock time
 * could not be matched by the planner anyway (DB5-A03).
 */
import { foreignKey, pgTable, primaryKey, text, unique, check } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { adminAccounts } from './admin-accounts';

/** DB3 state set for TBL-003. Canonical source — see DB5-A09. */
export const ADMIN_SESSION_STATES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type AdminSessionState = (typeof ADMIN_SESSION_STATES)[number];

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: idColumn().notNull(),
    adminAccountId: idReference('admin_account_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    status: stateColumn().notNull(),
    expiresAt: instant('expires_at').notNull(),
    revokedAt: instant('revoked_at'),
    clientMetadata: text('client_metadata'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_admin_sessions', columns: [t.id] }),
    // CST-004 / IDX-003 — session token collision or reuse is a security event.
    unique('uq_admin_sessions__token_hash').on(t.tokenHash),
    foreignKey({
      name: 'fk_admin_sessions__admin_account_id',
      columns: [t.adminAccountId],
      foreignColumns: [adminAccounts.id],
    }).onDelete('restrict'),
    check('ck_admin_sessions__status', stateCheck(t.status, ADMIN_SESSION_STATES)),
  ],
);
