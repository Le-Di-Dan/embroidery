/**
 * TBL-071 `notification_delivery_attempts` — one channel delivery try
 * result (CTX-NTF, AGG-22, `append` — ADR-DB2-003 Option B).
 *
 * Columns: COL-TBL071-01..06 · Constraints: CST-001, outcome closed set
 * (CK), CST-098-class append-only (S24)
 * Relationships: REL-100 (→ notification_intents, restrict)
 * Indexes: IDX-092 (P0 required — the only non-PK index on this table;
 * intent timeline + attempt-count input)
 * Owner: Notification module.
 *
 * Append-only evidence: no `updated_at`, a retry is a new row, never an
 * UPDATE of a prior attempt. Enforcing reject-UPDATE/DELETE at the database
 * level needs a trigger — **not yet a database mechanism**, same
 * honestly-documented gap as every other append-only table pending S24;
 * this group implements the CHECK/FK/index layer only.
 *
 * `provider_message_ref` is an opaque reference only, never authoritative
 * state and never a full provider payload/response (ADR-DB2-003 rule 5,
 * D7-12). `error_class` is a bounded failure classification, not a raw
 * provider error body. No trigger transitions the parent Intent's `status`
 * from an attempt outcome — TR-NTF-03/04/05 (DB3) are worker/App-owned.
 */
import { check, foreignKey, index, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { notificationIntents } from './notification-intents';

/** COL-TBL071-03 closed outcome set (DB4). Not a machine — one fact per row. */
export const NOTIFICATION_DELIVERY_OUTCOMES = [
  'DELIVERED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
] as const;
export type NotificationDeliveryOutcome = (typeof NOTIFICATION_DELIVERY_OUTCOMES)[number];

export const notificationDeliveryAttempts = pgTable(
  'notification_delivery_attempts',
  {
    id: sequenceColumn(),
    intentId: idReference('intent_id').notNull(),
    channel: text('channel').notNull(),
    outcome: text('outcome').notNull(),
    providerMessageRef: text('provider_message_ref'),
    errorClass: text('error_class'),
    attemptedAt: instant('attempted_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_notification_delivery_attempts', columns: [t.id] }),
    // REL-100 — the intent this attempt belongs to.
    foreignKey({
      name: 'fk_notification_delivery_attempts__intent_id',
      columns: [t.intentId],
      foreignColumns: [notificationIntents.id],
    }).onDelete('restrict'),
    check(
      'ck_notification_delivery_attempts__outcome_allowed',
      stateCheck(t.outcome, NOTIFICATION_DELIVERY_OUTCOMES),
    ),
    // IDX-092 — intent timeline + attempt-count input (QX-03).
    index('ix_notification_delivery_attempts__intent_id__attempted_at').on(
      t.intentId,
      t.attemptedAt,
    ),
  ],
);
