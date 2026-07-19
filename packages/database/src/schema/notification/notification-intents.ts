/**
 * TBL-070 `notification_intents` — one logical message decision: "system
 * decided to notify X about Y via channel Z" (CTX-NTF, AGG-22, `root`,
 * mutable — ADR-DB2-003 Option B).
 *
 * Columns: COL-TBL070-01..09 (-02 ×2) · Constraints: CST-001, CST-047 (UQ,
 * `intent_key` — GRD-012 `notification.intent` idempotency)
 * Relationships: REL-099 (→ customer_contact_points, nullable, no FK —
 * DEV-DB6-016), REL-101 (→ outbox_events, nullable, no FK — DEV-DB6-016)
 * Indexes: IDX-057 (UQ-backing, `intent_key`), IDX-091 (P0 required —
 * claimable-intent queue)
 * JSONB: boundary #8 `params`, discriminator `template_version`
 * Owner: Notification module.
 *
 * **Notification Intent ≠ Outbox Event.** `source_outbox_event_id` is an
 * optional origin trace only — outbox rows are transient and get cleaned
 * up, so this table never depends on that row still existing (REL-101 is
 * nullable and structurally uncoupled from outbox lifecycle; ADR-DB2-003
 * rule 1). Notification status/lifecycle facts live only here, never on
 * `outbox_events`, and this table never duplicates the outbox payload.
 *
 * **No rendered body, ever.** `params` (JSONB boundary #8) stores redacted
 * typed references only (ChallengeId, GrantId, OrderId, displayable
 * amounts) — structurally excludes OTP codes, tokens, secure-link URLs and
 * provider payloads (ADR-DB2-003 rule 2, D7-12). `template_version` is the
 * discriminator column, not embedded inside the JSONB. Rendering the actual
 * message from `template_key`/`template_version`/`params` is worker/App
 * behaviour, not a database concern.
 *
 * **Recipient model is dual.** `recipient_contact_point_id` is an optional
 * live lookup reference; `recipient_masked` is the frozen masked display
 * copy that survives contact-point anonymization/merge — historical
 * delivery evidence must not silently change when the underlying contact
 * point mutates. Neither field is a `customer_id` FK.
 *
 * **`channel` has no closed-set CHECK.** DB4/ADR-DB2-003 leave channel and
 * provider enumeration explicitly open (O-005, DEC-25) — see DEV-DB6-016.
 * Adding a CHECK here would lock in a set the product has not decided.
 *
 * No trigger creates this row from a source event, marks it SATISFIED,
 * spawns a Delivery Attempt, or mutates any other domain table — TR-NTF-01
 * through TR-NTF-06 (DB3) are worker/App-owned; this table only stores the
 * resulting facts.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';

/** LC (+1). Canonical source — see DB3 §"Notification Intent". */
export const NOTIFICATION_INTENT_STATES = [
  'PENDING',
  'PROCESSING',
  'SATISFIED',
  'FAILED',
  'CANCELLED',
] as const;
export type NotificationIntentState = (typeof NOTIFICATION_INTENT_STATES)[number];

/** IDX-091's claimable predicate set — non-terminal states only. */
export const NOTIFICATION_INTENT_CLAIMABLE_STATES = ['PENDING', 'PROCESSING'] as const;

export const notificationIntents = pgTable(
  'notification_intents',
  {
    id: idColumn().notNull(),
    intentKey: text('intent_key').notNull(),
    templateKey: text('template_key').notNull(),
    templateVersion: integer('template_version').notNull(),
    channel: text('channel').notNull(),
    recipientContactPointId: idReference('recipient_contact_point_id'),
    recipientMasked: text('recipient_masked').notNull(),
    params: jsonb('params').notNull(),
    status: stateColumn().notNull(),
    sourceOutboxEventId: bigint('source_outbox_event_id', { mode: 'bigint' }),
    correlationId: text('correlation_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_notification_intents', columns: [t.id] }),
    // CST-047 / IDX-057 — GRD-012 `notification.intent` idempotency arbiter.
    unique('uq_notification_intents__intent_key').on(t.intentKey),
    // REL-099 — recipient_contact_point_id: DEV-DB6-016, no foreignKey() declared.
    // REL-101 — source_outbox_event_id: DEV-DB6-016, no foreignKey() declared.
    check(
      'ck_notification_intents__status_allowed',
      stateCheck(t.status, NOTIFICATION_INTENT_STATES),
    ),
    // IDX-091 — claimable-intent queue (PENDING/PROCESSING), QX-03.
    index('ix_notification_intents__created_id__claimable')
      .on(t.createdAt, t.id)
      .where(sql`${t.status} in ('PENDING', 'PROCESSING')`),
  ],
);
