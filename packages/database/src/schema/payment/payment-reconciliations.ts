/**
 * TBL-057 `payment_reconciliations` — one manual reconciliation /
 * recalculation action record (CTX-PAY, `append`).
 *
 * Columns: COL-TBL057-01..08 · Constraints: CST-001, CK at least one target
 * set (COL-TBL057-02, DB4 column dictionary), CST-098-class append-only
 * (S24)
 * Relationships: REL-087 (→ payment_attempts, → payment_obligations, both
 * nullable, restrict — CC-09)
 * Indexes: IDX-124 (recommended) → S25; no other non-PK index
 * Owner: Payment module.
 *
 * **DEV-DB6-015 — `admin_id` stays a no-FK evidence reference.** Bare
 * actor-evidence column outside REL-105's closed enumeration
 * (TBL-042/045/063/072 only), same treatment as
 * `request_moderation_notes.admin_id` (G9). No FK is added; application and
 * audit integrity own it.
 *
 * `resolved_status` is deliberately left without a CHECK: it records
 * whichever status the reconciled attempt *or* obligation landed on
 * (LC-16's set or LC-15's set, depending on which target was resolved), and
 * DB4 does not define it as its own closed dictionary — inventing a
 * combined enum here would be a fabricated business rule, not a canonical
 * one.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, numeric, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { paymentAttempts } from './payment-attempts';
import { paymentObligations } from './payment-obligations';

/** COL-TBL057-03 closed action set (DB4, ADR-DB3-003 r7 evidence). */
export const PAYMENT_RECONCILIATION_ACTIONS = [
  'MANUAL_MATCH',
  'RESOLVE_REVIEW',
  'OBLIGATION_RECALC',
  'CARRYOVER_APPLICATION',
] as const;
export type PaymentReconciliationAction = (typeof PAYMENT_RECONCILIATION_ACTIONS)[number];

export const paymentReconciliations = pgTable(
  'payment_reconciliations',
  {
    id: sequenceColumn(),
    paymentAttemptId: idReference('payment_attempt_id'),
    paymentObligationId: idReference('payment_obligation_id'),
    action: text('action').notNull(),
    resolvedStatus: text('resolved_status'),
    amount: numeric('amount', { precision: 14, scale: 2 }),
    reason: text('reason').notNull(),
    adminId: idReference('admin_id').notNull(),
    bankReference: text('bank_reference'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_payment_reconciliations', columns: [t.id] }),
    // REL-087 — unmatched-event resolution target(s); CC-09 manual-vs-callback.
    foreignKey({
      name: 'fk_payment_reconciliations__payment_attempt_id',
      columns: [t.paymentAttemptId],
      foreignColumns: [paymentAttempts.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_payment_reconciliations__payment_obligation_id',
      columns: [t.paymentObligationId],
      foreignColumns: [paymentObligations.id],
    }).onDelete('restrict'),
    check(
      'ck_payment_reconciliations__action_allowed',
      stateCheck(t.action, PAYMENT_RECONCILIATION_ACTIONS),
    ),
    // COL-TBL057-02 — DB4: "CK at least one target set".
    check(
      'ck_payment_reconciliations__target_required',
      sql`${t.paymentAttemptId} is not null or ${t.paymentObligationId} is not null`,
    ),
    // CST-063 — amount non-negative when set.
    check(
      'ck_payment_reconciliations__amount_non_negative',
      sql`${t.amount} is null or ${t.amount} >= 0`,
    ),
    // IDX-124 (recommended) deferred to S25 — not implemented in this group.
  ],
);
