/**
 * TBL-058 `refunds` — one reviewed refund record, manual execution evidence
 * (CTX-PAY, `proc`, mutable (state) + immutable amounts).
 *
 * Columns: COL-TBL058-01..11 (-09 ×2, -10 ×2, -11 ×2) · Constraints:
 * CST-001, CST-063 instance (amount > 0), CST-068 (currency 'VND'),
 * CST-073 (status=EXECUTED → transfer_reference NOT NULL)
 * Relationships: REL-088 (→ payment_attempts, → orders, → order_
 * cancellation_requests (nullable), restrict — never overwrites the target
 * attempt)
 * Indexes: IDX-122 (recommended) → S25, IDX-123 (recommended) → S25; no
 * non-PK index implemented in this group
 * Owner: Payment module.
 *
 * **CST-100 — amount/target/currency immutable after insert is not yet a
 * database mechanism.** `payment_attempt_id`/`order_id`/
 * `cancellation_request_id`/`amount`/`currency_code` are documented as
 * frozen at creation; only `status`/decision fields (approve/reject/
 * execute) may advance. Enforcing that a later `UPDATE` cannot touch the
 * frozen columns needs a column-list trigger (same class as CST-090/092/096)
 * — S24 owns that mechanism; this group implements the CHECK/FK/index layer
 * only, same honestly-documented gap as those tables, and never overwrites
 * the target attempt itself. **CST-117** (refund amount ≤ reconciled
 * refundable amount, GRD-021) is a cross-row aggregate — TX/App and DB7-10/
 * D8-03's concern, not a CHECK; no cross-table arithmetic is fabricated
 * here.
 *
 * **DEV-DB6-015 — `approved_by_admin_id`/`executed_by_admin_id` stay no-FK
 * evidence references.** Bare actor-evidence columns outside REL-105's
 * closed enumeration (TBL-042/045/063/072 only), same treatment as
 * `request_moderation_notes.admin_id` (G9). No FK is added; application and
 * audit integrity own them.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, numeric, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { currencyScaleCheck } from '../../primitives/money';
import { paymentAttempts } from './payment-attempts';
import { orders } from '../ordering/orders';
import { orderCancellationRequests } from '../ordering/order-cancellation-requests';

/** COL-TBL058-07 closed method set (DB4), nullable — manual execution evidence. */
export const REFUND_METHODS = ['BANK_TRANSFER', 'OTHER'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

/** LC-20. Canonical source — see DB5-A09. */
export const REFUND_STATES = ['PENDING_REVIEW', 'APPROVED', 'EXECUTED', 'REJECTED'] as const;
export type RefundState = (typeof REFUND_STATES)[number];

export const refunds = pgTable(
  'refunds',
  {
    id: idColumn().notNull(),
    paymentAttemptId: idReference('payment_attempt_id').notNull(),
    orderId: idReference('order_id').notNull(),
    cancellationRequestId: idReference('cancellation_request_id'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    status: stateColumn().notNull(),
    method: text('method'),
    transferReference: text('transfer_reference'),
    reason: text('reason').notNull(),
    customerVisibleReason: text('customer_visible_reason'),
    approvedByAdminId: idReference('approved_by_admin_id'),
    executedByAdminId: idReference('executed_by_admin_id'),
    approvedAt: instant('approved_at'),
    executedAt: instant('executed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_refunds', columns: [t.id] }),
    // REL-088 — the attempt this refund reverses (never overwritten).
    foreignKey({
      name: 'fk_refunds__payment_attempt_id',
      columns: [t.paymentAttemptId],
      foreignColumns: [paymentAttempts.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_refunds__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_refunds__cancellation_request_id',
      columns: [t.cancellationRequestId],
      foreignColumns: [orderCancellationRequests.id],
    }).onDelete('restrict'),
    check('ck_refunds__status_allowed', stateCheck(t.status, REFUND_STATES)),
    check(
      'ck_refunds__method_allowed',
      sql`${t.method} is null or ${t.method} in ('BANK_TRANSFER', 'OTHER')`,
    ),
    // CST-063 — refund amounts are strictly positive.
    check('ck_refunds__amount_positive', sql`${t.amount} > 0`),
    check('ck_refunds__currency_vnd', sql`${t.currencyCode} = 'VND'`),
    // DB6-C5 (B2) — VND has no minor unit (DEV-DB6-005).
    check('ck_refunds__amount_currency_scale', currencyScaleCheck(t.amount, t.currencyCode)),
    // CST-073 — unevidenced refund execution.
    check(
      'ck_refunds__transfer_reference_required',
      sql`${t.status} <> 'EXECUTED' or ${t.transferReference} is not null`,
    ),
  ],
);
