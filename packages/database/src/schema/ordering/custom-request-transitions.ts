/**
 * TBL-042 `custom_request_transitions` — one request state transition with
 * actor, reason and correlation (CTX-ORD, AGG-13, `append` — ADR-DB4-002
 * Tier A history for LC-11).
 *
 * Columns: COL-TBL042-01..06 (-02 ×2, -03 ×5) · Constraints: CST-001,
 * CST-060 family (from/to in the LC-11 set), CST-098 (append-only, S24)
 * Relationships: REL-063 (fifth edge — → custom_requests) · REL-105 actor
 * edges for this table: admin_id → admin_accounts and customer_id →
 * customers **implemented now**; grant_id → secure_access_grants
 * **deferred, owner G10** (target table does not exist yet — nullable
 * column present, FK follows the DB4_DB6_HANDOFF nullable-ref pattern)
 * Indexes: IDX-100 (P1, with group — QX-01 timeline; the table's only
 * non-PK index, append-heavy)
 * Owner: Ordering module.
 *
 * `from_status`/`to_status` both CHECK against the same LC-11 tuple as the
 * root's status column — one canonical constant, three CHECKs, zero literal
 * drift (DB5-A09). Whether a *pair* is a legal transition is the DB3
 * transition matrix — a cross-fact owned by TX/App and DB7's matrix tests,
 * not by a CHECK. `actor_kind` carries no dictionary `(CK)` and none is
 * invented (consistent with TBL-019); actor↔ref consistency is app-owned
 * (the CST-072 trigger candidate belongs to audit_events only).
 */
import { check, foreignKey, index, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { customRequests, CUSTOM_REQUEST_STATES } from './custom-requests';
import { adminAccounts } from '../identity/admin-accounts';
import { customers } from '../customer/customers';

export const customRequestTransitions = pgTable(
  'custom_request_transitions',
  {
    id: sequenceColumn(),
    customRequestId: idReference('custom_request_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    actorKind: text('actor_kind').notNull(),
    adminId: idReference('admin_id'),
    customerId: idReference('customer_id'),
    grantId: idReference('grant_id'),
    systemJobKey: text('system_job_key'),
    reason: text('reason'),
    customerVisibleReason: text('customer_visible_reason'),
    correlationId: text('correlation_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_custom_request_transitions', columns: [t.id] }),
    foreignKey({
      name: 'fk_custom_request_transitions__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    // REL-105 (TBL-042 actor edges) — evidence FKs where DB4 lists them.
    foreignKey({
      name: 'fk_custom_request_transitions__admin_id',
      columns: [t.adminId],
      foreignColumns: [adminAccounts.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_custom_request_transitions__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    // grant_id FK lands with G10 (secure_access_grants does not exist yet).
    check(
      'ck_custom_request_transitions__from_status_allowed',
      stateCheck(t.fromStatus, CUSTOM_REQUEST_STATES),
    ),
    check(
      'ck_custom_request_transitions__to_status_allowed',
      stateCheck(t.toStatus, CUSTOM_REQUEST_STATES),
    ),
    // IDX-100 / QX-01 — request timeline replay in insert order.
    index('ix_request_transitions__request_id').on(t.customRequestId, t.id),
  ],
);
