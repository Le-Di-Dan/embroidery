/**
 * TBL-073 `outbox_events` — transactional outbox persistence (INV-23, GRD-029).
 *
 * `append` deliberately requires the caller's transaction: an outbox row that
 * commits without its domain write (or vice versa) is the exact failure the
 * outbox pattern exists to prevent. The atomicity is the transaction's, not a
 * property of this class.
 *
 * The payload is immutable and only the dispatch-metadata columns may change —
 * enforced physically by the S24 column-scoped trigger (CST-098), so this class
 * never has to be trusted to respect it.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, schema } from '@embroidery/database';
import type { OutboxEventState } from '@embroidery/database';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';

const { outboxEvents } = schema;

/**
 * Aggregate kinds an outbox event may reference (REL-104).
 *
 * `aggregate_id` has **no** foreign key by design: the reference is
 * polymorphic. The kind is validated against this closed set at write time
 * (G-DB7-47); the id's existence is guaranteed by the enclosing transaction,
 * which also wrote the aggregate row — not by the database.
 */
export const OUTBOX_AGGREGATE_KINDS = [
  'CUSTOM_REQUEST',
  'DESIGN_CASE',
  'DESIGN_VERSION',
  'APPROVAL_SNAPSHOT',
  'QUOTATION',
  'ORDER',
  'PAYMENT_OBLIGATION',
  'PAYMENT_ATTEMPT',
  'REFUND',
  'PRODUCTION_JOB',
  'INVENTORY_RESERVATION',
  'CUSTOMER',
  'ASSET',
  // `APP2-B03` — the aggregate of `product.published` / `product.unpublished`
  // (LC-04 `TR-LC04-01`/`TR-LC04-05`, IMP-D035). `aggregate_kind` is open text
  // with no CHECK by design (REL-104 is polymorphic), so this list is the
  // G-DB7-47 write-time guard, not a schema constraint — no migration.
  'PRODUCT',
  // `APP4-B01` — the aggregate of `notification.delivery.requested`
  // (`ADR-APP4-001` §7, IMP-D049 PO-09). Added on the same terms as `PRODUCT`
  // above: a write-time guard over polymorphic text, **no CHECK and no
  // migration**.
  //
  // `aggregate_id` is the **current** notification intent, which is what makes
  // the worker able to find its intent without decrypting anything. On an
  // `APP4-B08` manual replay the ciphertext is copied byte-identically, so the
  // encrypted `originNotificationIntentId` keeps naming the original failed
  // intent while this linkage names the new replay intent — they diverge on
  // purpose, and only this one is the execution identity.
  'NOTIFICATION_INTENT',
  // `APP12-C02` — the aggregate of `category.published` / `category.archived`,
  // the LC-04 delist/relist events for the taxonomy. Added on the same terms as
  // `PRODUCT` above: a write-time guard over polymorphic text, **no CHECK and no
  // migration**. Only the two transitions that change public visibility reach
  // the outbox; a draft that never was public announces nothing.
  'CATEGORY',
] as const;

export type OutboxAggregateKind = (typeof OUTBOX_AGGREGATE_KINDS)[number];

/** Bounds a claim batch so one worker cannot monopolise the queue. */
const MAX_CLAIM_BATCH = 100;

export interface AppendOutboxEventInput {
  readonly eventType: string;
  readonly aggregateKind: OutboxAggregateKind;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
  readonly payloadSchemaVersion: number;
}

export interface ClaimedOutboxEvent {
  readonly id: bigint;
  readonly eventType: string;
  readonly aggregateKind: OutboxAggregateKind;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly payloadSchemaVersion: number;
  readonly attemptCount: number;
}

@Injectable()
export class OutboxEventStore extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Appends an event inside the caller's domain transaction.
   *
   * @requiresTransaction — this is the whole point of the outbox pattern.
   */
  async append(input: AppendOutboxEventInput): Promise<bigint> {
    return this.run('append', async () => {
      const tx = this.requireTransaction('append');
      assertKnownAggregateKind(input.aggregateKind, 'append');

      const [row] = await tx
        .insert(outboxEvents)
        .values({
          eventType: input.eventType,
          aggregateKind: input.aggregateKind,
          aggregateId: input.aggregateId,
          payload: input.payload,
          payloadSchemaVersion: input.payloadSchemaVersion,
          status: 'PENDING',
          attemptCount: 0,
          nextAttemptAt: new Date(),
        })
        .returning({ id: outboxEvents.id });

      if (row === undefined) {
        throw guardViolationError(
          'OutboxEventStore.append',
          'OUTBOX_APPEND_FAILED',
          'Could not record the event.',
        );
      }
      return row.id;
    });
  }

  /**
   * Claims a batch of due events for one worker.
   *
   * `FOR UPDATE SKIP LOCKED` is the DB5 worker-claim access path (ADR-DB5-003):
   * a second worker skips rows this one holds rather than blocking on them.
   *
   * DB7 proves the claim path works in a single run. **Multi-worker exclusivity
   * is not proven here** — that is DB8 CC-25.
   *
   * @requiresTransaction — the lock lives only as long as the transaction.
   */
  async claimBatch(
    workerId: string,
    limit: number,
    now = new Date(),
  ): Promise<ClaimedOutboxEvent[]> {
    return this.run('claimBatch', async () => {
      const tx = this.requireTransaction('claimBatch');
      const batchSize = Math.min(Math.max(limit, 1), MAX_CLAIM_BATCH);

      const due = await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            inArray(outboxEvents.status, ['PENDING', 'FAILED']),
            or(isNull(outboxEvents.nextAttemptAt), lte(outboxEvents.nextAttemptAt, now)),
          ),
        )
        .orderBy(asc(outboxEvents.id))
        .limit(batchSize)
        .for('update', { skipLocked: true });

      if (due.length === 0) {
        return [];
      }

      const claimed = await tx
        .update(outboxEvents)
        .set({
          claimedBy: workerId,
          claimedAt: now,
          attemptCount: sql`${outboxEvents.attemptCount} + 1`,
        })
        .where(
          inArray(
            outboxEvents.id,
            due.map((row) => row.id),
          ),
        )
        .returning();

      return claimed
        .map((row) => ({
          id: row.id,
          eventType: row.eventType,
          aggregateKind: row.aggregateKind as OutboxAggregateKind,
          aggregateId: row.aggregateId,
          payload: row.payload,
          payloadSchemaVersion: row.payloadSchemaVersion,
          attemptCount: row.attemptCount,
        }))
        .sort((left, right) => (left.id < right.id ? -1 : 1));
    });
  }

  /** Marks a claimed event delivered. @requiresTransaction */
  async markDispatched(id: bigint, at = new Date()): Promise<void> {
    return this.run('markDispatched', async () => {
      const tx = this.requireTransaction('markDispatched');
      await tx
        .update(outboxEvents)
        .set({ status: 'DISPATCHED', dispatchedAt: at, claimedBy: null, claimedAt: null })
        .where(eq(outboxEvents.id, id));
    });
  }

  /**
   * Schedules a retry after a failed dispatch.
   *
   * `lastError` is a caller-supplied **class**, not a provider message: an
   * upstream error body can carry a token or a customer's address, and this
   * column is read by operators.
   *
   * @requiresTransaction
   */
  async scheduleRetry(id: bigint, nextAttemptAt: Date, errorClass: string): Promise<void> {
    return this.run('scheduleRetry', async () => {
      const tx = this.requireTransaction('scheduleRetry');
      await tx
        .update(outboxEvents)
        .set({
          status: 'FAILED',
          nextAttemptAt,
          lastError: errorClass,
          claimedBy: null,
          claimedAt: null,
        })
        .where(eq(outboxEvents.id, id));
    });
  }

  /** Retires an event after its retries are exhausted. @requiresTransaction */
  async markDeadLetter(id: bigint, errorClass: string): Promise<void> {
    return this.run('markDeadLetter', async () => {
      const tx = this.requireTransaction('markDeadLetter');
      await tx
        .update(outboxEvents)
        .set({
          status: 'DEAD_LETTER',
          nextAttemptAt: null,
          lastError: errorClass,
          claimedBy: null,
          claimedAt: null,
        })
        .where(eq(outboxEvents.id, id));
    });
  }

  /**
   * The terminal source events for one aggregate and event type (`APP4-B08`).
   *
   * The Admin manual-replay path needs the opaque payload of the `DEAD_LETTER`
   * row an exhausted automatic retry left behind, so it can be copied forward
   * onto a new event **without being decrypted**. `listForAggregate` above
   * deliberately does not return the payload — it is a diagnostic read — so this
   * is a separate, narrower method rather than a widening of it.
   *
   * ### The lookup is by linkage, never by content
   *
   * Every predicate is a plain indexed column: the polymorphic REL-104 reference
   * (`aggregate_kind`, `aggregate_id`), the event type, and the status. Nothing
   * here touches `payload`. That is the whole point — ADR-DB4-004 rule 5 forbids
   * querying JSONB internals, and the payload is an AEAD envelope whose only
   * intent reference is encrypted lineage, not execution identity (IMP-D049
   * PO-08). A caller that had to look inside it to find its own row would have
   * to decrypt, which the API must never do.
   *
   * ### It returns a list, and the caller decides
   *
   * Returning the payload of "the" terminal row would force this method to pick
   * one when there is more than one, and a persistence adapter silently choosing
   * which credential to re-deliver is exactly the decision that belongs to the
   * application. So every match comes back, ordered, and the caller fails closed
   * on anything but exactly one.
   */
  async listTerminalEventsForAggregate(
    aggregateKind: OutboxAggregateKind,
    aggregateId: string,
    eventType: string,
  ): Promise<
    {
      id: bigint;
      payload: unknown;
      payloadSchemaVersion: number;
      status: OutboxEventState;
    }[]
  > {
    return this.run('listTerminalEventsForAggregate', async () => {
      const rows = await this.db
        .select({
          id: outboxEvents.id,
          payload: outboxEvents.payload,
          payloadSchemaVersion: outboxEvents.payloadSchemaVersion,
          status: outboxEvents.status,
        })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.aggregateKind, aggregateKind),
            eq(outboxEvents.aggregateId, aggregateId),
            eq(outboxEvents.eventType, eventType),
            eq(outboxEvents.status, 'DEAD_LETTER'),
          ),
        )
        .orderBy(asc(outboxEvents.id));

      return rows.map((row) => ({
        id: row.id,
        payload: row.payload,
        payloadSchemaVersion: row.payloadSchemaVersion,
        status: row.status as OutboxEventState,
      }));
    });
  }

  /** Reads events for an aggregate. Diagnostic and test use. */
  async listForAggregate(
    aggregateKind: OutboxAggregateKind,
    aggregateId: string,
  ): Promise<{ id: bigint; eventType: string; status: OutboxEventState }[]> {
    return this.run('listForAggregate', async () => {
      const rows = await this.db
        .select({
          id: outboxEvents.id,
          eventType: outboxEvents.eventType,
          status: outboxEvents.status,
        })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.aggregateKind, aggregateKind),
            eq(outboxEvents.aggregateId, aggregateId),
          ),
        )
        .orderBy(asc(outboxEvents.id));

      return rows.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        status: row.status as OutboxEventState,
      }));
    });
  }
}

/**
 * G-DB7-47 — validates the polymorphic kind, which has no FK to back it.
 *
 * An unknown kind means a consumer will never resolve the reference, so it is
 * rejected at write time rather than discovered by a worker much later.
 */
function assertKnownAggregateKind(kind: string, operation: string): void {
  if (!(OUTBOX_AGGREGATE_KINDS as readonly string[]).includes(kind)) {
    throw guardViolationError(
      `OutboxEventStore.${operation}`,
      'UNKNOWN_AGGREGATE_KIND',
      'That aggregate kind is not recognised.',
    );
  }
}
