/**
 * TBL-045 `order_transitions` — one order state transition, delivery event
 * or saga step, with actor and correlation (CTX-ORD, AGG-15, `append` —
 * ADR-DB4-002 Tier A history for LC-14/19/21, CON-081).
 *
 * Columns: COL-TBL045-01..08 (-02 ×2, -05 ×5) · Constraints: CST-001,
 * CST-060 family (from/to in the LC-14 set), CST-098-class append-only (S24)
 * Relationships: REL-078 (fifth edge — → orders), REL-105 actor edges for
 * this table: admin_id → admin_accounts, customer_id → customers, grant_id
 * → secure_access_grants (all three implemented now — every target table
 * already exists)
 * Indexes: IDX-101 (P0 required — QX timeline), IDX-103 (P0 required —
 * SAGA_STEP resume subset)
 * Owner: Ordering module.
 *
 * **CON-081 absorbs Delivery State** (DB2 locked decision): delivery
 * events and saga steps are order transition events, not a separate
 * aggregate or table — `event_kind` distinguishes
 * `STATE_CHANGE`/`DELIVERY_EVENT`/`SAGA_STEP`/`SHIPPING_FREEZE`/
 * `POINTER_MOVE`/`POST_FREEZE_CORRECTION`. `POINTER_MOVE` rows are the
 * audit trail for `orders.current_approval_snapshot_id` repointing
 * (ADR-DB3-003 r4); `saga_step` is populated only on `SAGA_STEP` rows.
 *
 * `from_status`/`to_status` both CHECK against the same LC-14 tuple as the
 * root's status column. Whether a *pair* is a legal transition is the DB3
 * transition matrix — TX/App and DB7's matrix tests, not a CHECK.
 * `actor_kind` carries no dictionary set and none is invented (same
 * treatment as `custom_request_transitions`).
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { orders, ORDER_STATES } from './orders';
import { adminAccounts } from '../identity/admin-accounts';
import { customers } from '../customer/customers';
import { secureAccessGrants } from '../customer/secure-access-grants';

export const ORDER_TRANSITION_EVENT_KINDS = [
  'STATE_CHANGE',
  'DELIVERY_EVENT',
  'SAGA_STEP',
  'SHIPPING_FREEZE',
  'POINTER_MOVE',
  'POST_FREEZE_CORRECTION',
] as const;
export type OrderTransitionEventKind = (typeof ORDER_TRANSITION_EVENT_KINDS)[number];

export const orderTransitions = pgTable(
  'order_transitions',
  {
    id: sequenceColumn(),
    orderId: idReference('order_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    eventKind: text('event_kind').notNull(),
    sagaStep: text('saga_step'),
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
    primaryKey({ name: 'pk_order_transitions', columns: [t.id] }),
    // REL-078 — history is composed under its order; restrict keeps it intact.
    foreignKey({
      name: 'fk_order_transitions__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    // REL-105 — actor evidence FKs where DB4 lists them.
    foreignKey({
      name: 'fk_order_transitions__admin_id',
      columns: [t.adminId],
      foreignColumns: [adminAccounts.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_order_transitions__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_order_transitions__grant_id',
      columns: [t.grantId],
      foreignColumns: [secureAccessGrants.id],
    }).onDelete('restrict'),
    check('ck_order_transitions__from_status_allowed', stateCheck(t.fromStatus, ORDER_STATES)),
    check('ck_order_transitions__to_status_allowed', stateCheck(t.toStatus, ORDER_STATES)),
    check(
      'ck_order_transitions__event_kind_allowed',
      stateCheck(t.eventKind, ORDER_TRANSITION_EVENT_KINDS),
    ),
    // IDX-101 / QX — order timeline replay in insert order.
    index('ix_order_transitions__order_id').on(t.orderId, t.id),
    // IDX-103 — SAGA_STEP resume subset (CC-13 resumable compensation).
    index('ix_order_transitions__order_id__saga_step')
      .on(t.orderId, t.id)
      .where(sql`${t.eventKind} = 'SAGA_STEP'`),
  ],
);
