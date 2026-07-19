/**
 * TBL-008 `secure_access_grants` — one hashed-token, scoped authorization
 * evidence binding a customer to one request (CTX-CUS, AGG-02 workflow).
 *
 * Columns: COL-TBL008-01..09 · Constraints: CST-001, CST-008 (IDX-007),
 * CST-009 (IDX-008, LC-03)
 * Relationships: REL-009 (→ customers), REL-010 (→ custom_requests),
 * REL-011 (self, `superseded_by_grant_id` — reissue chain)
 * Indexes: IDX-007 (constraint-created, UQ token_hash), IDX-008
 * (constraint-created, pUQ active grant); IDX-105/106/107 (P0/P1, with
 * group)
 * Owner: Customer module.
 *
 * A grant is **not** a Customer account: no password, no refresh token, no
 * API key, no plaintext OTP. `token_hash` stores a hash only (CST-008,
 * D7-12) — the raw high-entropy token is never persisted, mirroring
 * `admin_sessions.token_hash`/`design_sessions.session_secret_hash`.
 * `scope_kind` is a single closed value today (`REQUEST_ACCESS`,
 * ADR-DB3-004 r1); a future multi-scope model adds a child table
 * additively rather than widening this column's meaning.
 *
 * **Revoke-vs-use race** (CST-116, D8-20) is TX/App: the action transaction
 * re-reads grant status/expiry/scope before acting, and a committed revoke
 * always wins over an in-flight action. No CHECK can arbitrate a race
 * against wall-clock time or a concurrent UPDATE — that guard is GRD-002 in
 * the consuming transaction, not here.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { customers } from './customers';
import { customRequests } from '../ordering/custom-requests';

/** LC-03. Canonical source — see DB5-A09. */
export const SECURE_ACCESS_GRANT_STATES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type SecureAccessGrantState = (typeof SECURE_ACCESS_GRANT_STATES)[number];

/** COL-TBL008-04 closed scope set (DB4, ADR-DB3-004 r1). */
export const GRANT_SCOPE_KINDS = ['REQUEST_ACCESS'] as const;
export type GrantScopeKind = (typeof GRANT_SCOPE_KINDS)[number];

export const secureAccessGrants = pgTable(
  'secure_access_grants',
  {
    id: idColumn().notNull(),
    customerId: idReference('customer_id').notNull(),
    customRequestId: idReference('custom_request_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopeKind: text('scope_kind').notNull(),
    status: stateColumn().notNull(),
    expiresAt: instant('expires_at').notNull(),
    revokedAt: instant('revoked_at'),
    revokeReason: text('revoke_reason'),
    supersededByGrantId: idReference('superseded_by_grant_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_secure_access_grants', columns: [t.id] }),
    // CST-008 / IDX-007 — token collision or plaintext-leak vector; this is
    // the security-critical lookup path (DB5 §2), not an optimization.
    unique('uq_secure_access_grants__token_hash').on(t.tokenHash),
    // CST-009 / IDX-008 — single active grant per (customer, request); a
    // reissue transaction revokes the prior row before inserting a new one.
    uniqueIndex('uq_secure_access_grants__customer_request__active')
      .on(t.customerId, t.customRequestId)
      .where(sql`${t.status} = 'ACTIVE'`),
    // REL-009 — a grant is authorization evidence, not identity; deleting
    // the customer must not silently invalidate audit history.
    foreignKey({
      name: 'fk_secure_access_grants__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    // REL-010 — scope binding (INV-08); grants outlive nothing about the
    // request they authorize access to.
    foreignKey({
      name: 'fk_secure_access_grants__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    // REL-011 — reissue chain (TR-LC03-01); self-referencing, nullable.
    foreignKey({
      name: 'fk_secure_access_grants__superseded_by_grant_id',
      columns: [t.supersededByGrantId],
      foreignColumns: [t.id],
    }).onDelete('restrict'),
    check(
      'ck_secure_access_grants__status_allowed',
      stateCheck(t.status, SECURE_ACCESS_GRANT_STATES),
    ),
    check(
      'ck_secure_access_grants__scope_kind_allowed',
      stateCheck(t.scopeKind, GRANT_SCOPE_KINDS),
    ),
    // [R] on admin revoke — a revoked grant without a reason is not evidence.
    check(
      'ck_secure_access_grants__revoke_reason_required',
      sql`${t.status} <> 'REVOKED' or ${t.revokeReason} is not null`,
    ),
    // IDX-105 / QX-06 — expiry sweep over active grants only.
    index('ix_secure_access_grants__expires_at')
      .on(t.expiresAt, t.id)
      .where(sql`${t.status} = 'ACTIVE'`),
    // IDX-106 — grants for a request; revoke-on-merge fan-out.
    index('ix_secure_access_grants__custom_request_id').on(t.customRequestId),
    // IDX-107 — required despite IDX-008 leading with customer_id: IDX-008
    // is a partial index over ACTIVE rows only, but CC-27 merge revoke must
    // find every grant for a customer regardless of status.
    index('ix_secure_access_grants__customer_id').on(t.customerId),
  ],
);
