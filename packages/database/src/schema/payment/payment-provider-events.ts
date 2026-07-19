/**
 * TBL-056 `payment_provider_events` — one verified/received provider
 * callback event, redacted evidence (CTX-PAY, `append`).
 *
 * Columns: COL-TBL056-01..09 (-05 ×2) · Constraints: CST-001, CST-040
 * (IDX-043, provider event unique — INV-07/GRD-012), CST-098-class
 * append-only (S24)
 * Relationships: REL-086 (→ payment_attempts, nullable, restrict —
 * unmatched events await reconciliation)
 * Indexes: IDX-043 (constraint-created), IDX-079 (P0 required — timeline),
 * IDX-080 (P0 required — matched-event lookup), IDX-081 (P0 required —
 * unmatched-event sweep)
 * Owner: Payment module.
 *
 * **Redacted evidence, not raw payload.** `redacted_payload` is the one
 * approved JSONB boundary for this table (ADR-DB4-004 #6): provider mapping
 * discriminates by `provider_key`, no secrets/PAN/signatures beyond the
 * verification outcome are stored, and reconciliation always filters on the
 * relational columns (`provider_ref`, `amount`, `application_outcome`), never
 * on JSONB contents. `signature_valid` is the server-side verification
 * outcome (INV-15) — callback signature *verification* itself is application
 * security, not a database CHECK. `payment_attempt_id` is nullable by design:
 * an event can arrive before/without a matching attempt and waits for
 * `payment_reconciliations` to resolve it.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { paymentAttempts } from './payment-attempts';

/** COL-TBL056-04 closed event-kind set (DB4). */
export const PAYMENT_PROVIDER_EVENT_KINDS = ['SUCCESS', 'FAILURE', 'EXPIRY', 'INFO'] as const;
export type PaymentProviderEventKind = (typeof PAYMENT_PROVIDER_EVENT_KINDS)[number];

/** COL-TBL056-08 closed application-outcome set (DB4, LC-16 out-of-order rule). */
export const PAYMENT_PROVIDER_EVENT_OUTCOMES = [
  'APPLIED',
  'REPLAYED',
  'RECORDED_NO_OP',
  'ESCALATED',
] as const;
export type PaymentProviderEventOutcome = (typeof PAYMENT_PROVIDER_EVENT_OUTCOMES)[number];

export const paymentProviderEvents = pgTable(
  'payment_provider_events',
  {
    id: sequenceColumn(),
    providerKey: text('provider_key').notNull(),
    providerEventRef: text('provider_event_ref').notNull(),
    paymentAttemptId: idReference('payment_attempt_id'),
    eventKind: text('event_kind').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }),
    currencyCode: text('currency_code'),
    redactedPayload: jsonb('redacted_payload').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    applicationOutcome: text('application_outcome').notNull(),
    receivedAt: instant('received_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_payment_provider_events', columns: [t.id] }),
    // CST-040 / IDX-043 — provider event unique, the idempotency claim itself.
    unique('uq_payment_provider_events__provider_key__provider_event_ref').on(
      t.providerKey,
      t.providerEventRef,
    ),
    // REL-086 — unmatched events await reconciliation (nullable).
    foreignKey({
      name: 'fk_payment_provider_events__payment_attempt_id',
      columns: [t.paymentAttemptId],
      foreignColumns: [paymentAttempts.id],
    }).onDelete('restrict'),
    check(
      'ck_payment_provider_events__event_kind_allowed',
      stateCheck(t.eventKind, PAYMENT_PROVIDER_EVENT_KINDS),
    ),
    check(
      'ck_payment_provider_events__application_outcome_allowed',
      stateCheck(t.applicationOutcome, PAYMENT_PROVIDER_EVENT_OUTCOMES),
    ),
    // CST-063 — provider-reported amount, non-negative when reported.
    check(
      'ck_payment_provider_events__amount_non_negative',
      sql`${t.amount} is null or ${t.amount} >= 0`,
    ),
    check(
      'ck_payment_provider_events__currency_vnd',
      sql`${t.currencyCode} is null or ${t.currencyCode} = 'VND'`,
    ),
    // IDX-079 — event timeline, most-recent first.
    index('ix_payment_provider_events__received_id').on(t.receivedAt.desc(), t.id.desc()),
    // IDX-080 — matched-event lookup by attempt.
    index('ix_payment_provider_events__attempt_id__matched')
      .on(t.paymentAttemptId)
      .where(sql`${t.paymentAttemptId} is not null`),
    // IDX-081 — unmatched-event sweep for reconciliation.
    index('ix_payment_provider_events__received_id__unmatched')
      .on(t.receivedAt, t.id)
      .where(sql`${t.paymentAttemptId} is null`),
  ],
);
