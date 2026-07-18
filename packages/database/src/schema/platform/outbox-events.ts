/**
 * TBL-073 `outbox_events` — one transactional outbox event (CTX-PLT).
 *
 * Columns: COL-TBL073-01..10 · Constraints: CST-001, CST-060, CST-099
 * Relationships: REL-104 — polymorphic aggregate reference, **no FK**
 * Indexes: IDX-088 (claim), IDX-090 (cleanup) — slice S25
 * JSONB: payload #4 `payload`, version key `payload_schema_version`
 * Owner: Platform module.
 *
 * **Append + column-scoped**, not append-only (DB5-A10). The payload and the
 * event identity are immutable; a bounded set of dispatch columns is mutable:
 *
 *     status, attempt_count, next_attempt_at, claimed_by, claimed_at,
 *     dispatched_at, last_error
 *
 * That list is CST-099 and is enforced in slice S24 by a column-scoped trigger,
 * **not** by a blanket update ban — a blanket ban would make the dispatcher
 * unable to record its own progress. There is deliberately no `updated_at`:
 * it is not in the mutable set, so adding it would contradict the trigger.
 *
 * `aggregate_kind`/`aggregate_id` are a **justified polymorphic reference**
 * (REL-104): an outbox row may point at any aggregate, so no FK is possible.
 * This is the recorded exception, not an oversight.
 *
 * The claim path uses `FOR UPDATE SKIP LOCKED` (GRD-029/CC-25), verified at
 * DB6. `next_attempt_at` is NULL for never-deferred events, which is why
 * IDX-088 carries `NULLS FIRST` — the default would drain the queue backwards.
 */
import { check, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';

/** LC-22. Canonical source — see DB5-A09. */
export const OUTBOX_EVENT_STATES = ['PENDING', 'DISPATCHED', 'FAILED', 'DEAD_LETTER'] as const;
export type OutboxEventState = (typeof OUTBOX_EVENT_STATES)[number];

/** The CST-099 column-scoped mutable set. Consumed by the S24 trigger. */
export const OUTBOX_MUTABLE_COLUMNS = [
  'status',
  'attempt_count',
  'next_attempt_at',
  'claimed_by',
  'claimed_at',
  'dispatched_at',
  'last_error',
] as const;

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: sequenceColumn(),
    eventType: text('event_type').notNull(),
    aggregateKind: text('aggregate_kind').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    payloadSchemaVersion: integer('payload_schema_version').notNull(),
    status: stateColumn().notNull(),
    attemptCount: integer('attempt_count').notNull(),
    nextAttemptAt: instant('next_attempt_at'),
    claimedBy: text('claimed_by'),
    claimedAt: instant('claimed_at'),
    dispatchedAt: instant('dispatched_at'),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_outbox_events', columns: [t.id] }),
    check('ck_outbox_events__status_allowed', stateCheck(t.status, OUTBOX_EVENT_STATES)),
  ],
);
