/**
 * Drizzle implementation of the AGG-22 Notification Intent contract
 * (TBL-070, TBL-071).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { NotificationDeliveryOutcome, NotificationIntentState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';

import type {
  AdminIntentListFilter,
  CreateIntentInput,
  CreateIntentOutcome,
  IntentId,
  NotificationDeliveryAttemptRecord,
  NotificationIntent,
  NotificationIntentRecord,
  NotificationIntentRepository,
} from '../../domain/repositories/notification-intent.repository';

const { notificationIntents, notificationDeliveryAttempts, customerContactPoints, outboxEvents } =
  schema;

type IntentRow = typeof notificationIntents.$inferSelect;

function toIntent(row: IntentRow): NotificationIntent {
  return {
    id: row.id as IntentId,
    intentKey: row.intentKey,
    templateKey: row.templateKey,
    channel: row.channel,
    recipientMasked: row.recipientMasked,
    status: row.status as NotificationIntentState,
    correlationId: row.correlationId,
  };
}

/**
 * The wider `APP4-B08` read model.
 *
 * `params` is cast rather than validated here: the column is `jsonb` and its
 * shape is the application's own `buildIntentParams` contract, so a persistence
 * adapter asserting a discriminated union would be a second authority over it.
 * The one caller that reads it — the replay eligibility resolver — parses it
 * against that contract and fails closed.
 */
function toRecord(row: IntentRow): NotificationIntentRecord {
  return {
    id: row.id as IntentId,
    intentKey: row.intentKey,
    templateKey: row.templateKey,
    templateVersion: row.templateVersion,
    channel: row.channel,
    recipientContactPointId: row.recipientContactPointId ?? undefined,
    recipientMasked: row.recipientMasked,
    params: (row.params ?? {}) as Record<string, unknown>,
    status: row.status as NotificationIntentState,
    sourceOutboxEventId: row.sourceOutboxEventId ?? undefined,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class DrizzleNotificationIntentRepository
  extends DrizzleRepository
  implements NotificationIntentRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async createIdempotent(input: CreateIntentInput): Promise<CreateIntentOutcome> {
    return this.run('createIdempotent', async () => {
      const tx = this.requireTransaction('createIdempotent');

      // G-DB7-48: `recipient_contact_point_id` has no FK, because an intent may
      // target an address that is not yet a contact point. When one *is* named,
      // it must resolve — an unresolvable id would make the intent
      // undeliverable and untraceable.
      if (input.recipientContactPointId !== undefined) {
        const [contact] = await tx
          .select({ id: customerContactPoints.id })
          .from(customerContactPoints)
          .where(eq(customerContactPoints.id, input.recipientContactPointId))
          .limit(1);

        if (contact === undefined) {
          throw guardViolationError(
            'NotificationIntentRepository.createIdempotent',
            'RECIPIENT_CONTACT_NOT_FOUND',
            'That recipient contact point does not exist.',
          );
        }
      }

      // G-DB7-49: `source_outbox_event_id` has no FK because outbox rows are
      // TTL-cleaned and a FK would block that cleanup. Resolved at creation
      // only; a later-missing row is permitted by design, not a defect.
      if (input.sourceOutboxEventId !== undefined) {
        const [event] = await tx
          .select({ id: outboxEvents.id })
          .from(outboxEvents)
          .where(eq(outboxEvents.id, input.sourceOutboxEventId))
          .limit(1);

        if (event === undefined) {
          throw guardViolationError(
            'NotificationIntentRepository.createIdempotent',
            'SOURCE_EVENT_NOT_FOUND',
            'That source event does not exist.',
          );
        }
      }

      const [inserted] = await tx
        .insert(notificationIntents)
        .values({
          id: input.id,
          intentKey: input.intentKey,
          templateKey: input.templateKey,
          templateVersion: input.templateVersion,
          channel: input.channel,
          recipientContactPointId: input.recipientContactPointId ?? null,
          recipientMasked: input.recipientMasked,
          params: input.params,
          status: 'PENDING',
          sourceOutboxEventId: input.sourceOutboxEventId ?? null,
          correlationId: input.correlationId,
        })
        .onConflictDoNothing({ target: notificationIntents.intentKey })
        .returning();

      if (inserted !== undefined) {
        return { outcome: 'created' as const, intent: toIntent(inserted) };
      }

      // Same key, same decision: the caller replays rather than sending twice.
      const existing = await this.loadByKey(input.intentKey);
      if (existing === undefined) {
        throw notFoundError(
          'NotificationIntentRepository.createIdempotent',
          'That notification intent could not be read.',
        );
      }
      return { outcome: 'replay' as const, intent: existing };
    });
  }

  async claimBatch(limit: number): Promise<NotificationIntent[]> {
    return this.run('claimBatch', async () => {
      const tx = this.requireTransaction('claimBatch');
      const batchSize = Math.min(Math.max(limit, 1), 100);

      const due = await tx
        .select({ id: notificationIntents.id })
        .from(notificationIntents)
        .where(eq(notificationIntents.status, 'PENDING'))
        .orderBy(asc(notificationIntents.createdAt))
        .limit(batchSize)
        .for('update', { skipLocked: true });

      if (due.length === 0) {
        return [];
      }

      const claimed = await tx
        .update(notificationIntents)
        .set({ status: 'PROCESSING', updatedAt: new Date() })
        .where(
          inArray(
            notificationIntents.id,
            due.map((row) => row.id),
          ),
        )
        .returning();

      return claimed.map(toIntent);
    });
  }

  async recordAttempt(input: {
    intentId: IntentId;
    channel: string;
    outcome: NotificationDeliveryOutcome;
    providerMessageRef?: string | undefined;
    errorClass?: string | undefined;
    attemptedAt: Date;
  }): Promise<void> {
    return this.run('recordAttempt', async () => {
      await this.db.insert(notificationDeliveryAttempts).values({
        intentId: input.intentId,
        channel: input.channel,
        outcome: input.outcome,
        providerMessageRef: input.providerMessageRef ?? null,
        // A class, never a provider body: an upstream error message can carry
        // the recipient's address, and this column is read by operators.
        errorClass: input.errorClass ?? null,
        attemptedAt: input.attemptedAt,
      });
    });
  }

  async markDelivered(id: IntentId): Promise<void> {
    return this.run('markDelivered', () => this.settle(id, 'SATISFIED'));
  }

  async markFailed(id: IntentId): Promise<void> {
    return this.run('markFailed', () => this.settle(id, 'FAILED'));
  }

  async findByIntentKey(intentKey: string): Promise<NotificationIntent | undefined> {
    return this.run('findByIntentKey', () => this.loadByKey(intentKey));
  }

  /**
   * The `APP4-B08` Admin support list.
   *
   * Newest first with `id` as the tie-breaker, so two intents created in one
   * transaction render in a stable order. The status predicate is applied only
   * when a filter is given; the closed set it belongs to is validated at the
   * wire, not here.
   *
   * ### The Customer predicate is a join, not a comparison
   *
   * When `customerId` is given the query inner-joins `customer_contact_points`
   * on `recipient_contact_point_id` and compares that row's `customer_id`. An
   * inner join is what makes the null case correct for free: an intent with no
   * `recipient_contact_point_id` produces no joined row and drops out, which is
   * exactly the truthful answer — that intent has no persisted owner.
   *
   * No FK backs the reference (DEV-DB6-016 / G-DB7-48), so the join is the only
   * thing that establishes the relationship at read time. Note what is *not*
   * compared anywhere in here: `recipient_masked`, `template_key`, `channel` and
   * `created_at` are projected but never predicated on for ownership.
   */
  async listForAdmin(filter: AdminIntentListFilter): Promise<NotificationIntentRecord[]> {
    return this.run('listForAdmin', async () => {
      const statusPredicate =
        filter.status === undefined ? undefined : eq(notificationIntents.status, filter.status);

      if (filter.customerId === undefined) {
        const rows = await this.db
          .select()
          .from(notificationIntents)
          .where(statusPredicate)
          .orderBy(desc(notificationIntents.createdAt), desc(notificationIntents.id))
          .limit(filter.limit);

        return rows.map(toRecord);
      }

      const rows = await this.db
        .select({ intent: notificationIntents })
        .from(notificationIntents)
        .innerJoin(
          customerContactPoints,
          eq(notificationIntents.recipientContactPointId, customerContactPoints.id),
        )
        .where(and(statusPredicate, eq(customerContactPoints.customerId, filter.customerId)))
        .orderBy(desc(notificationIntents.createdAt), desc(notificationIntents.id))
        .limit(filter.limit);

      return rows.map((row) => toRecord(row.intent));
    });
  }

  async findById(id: IntentId): Promise<NotificationIntentRecord | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(notificationIntents)
        .where(eq(notificationIntents.id, id))
        .limit(1);
      return row === undefined ? undefined : toRecord(row);
    });
  }

  /**
   * `FOR UPDATE`, deliberately without `SKIP LOCKED`.
   *
   * The claim path skips locked rows because a second worker should take
   * different work. An Admin replay is the opposite: two callers naming the same
   * intent must serialize so the second sees what the first committed. Skipping
   * would let both proceed and append two deliveries for one decision.
   *
   * @requiresTransaction
   */
  async lockById(id: IntentId): Promise<NotificationIntentRecord | undefined> {
    return this.run('lockById', async () => {
      const tx = this.requireTransaction('lockById');
      const [row] = await tx
        .select()
        .from(notificationIntents)
        .where(eq(notificationIntents.id, id))
        .limit(1)
        .for('update');
      return row === undefined ? undefined : toRecord(row);
    });
  }

  /**
   * The attempt timeline, chronological and deterministic.
   *
   * `provider_message_ref` is not selected: APP4 ships only the recording
   * adapter, so the column is always null, and a field that never carries
   * anything is an invitation to put a provider body in it later.
   */
  async listAttempts(id: IntentId): Promise<NotificationDeliveryAttemptRecord[]> {
    return this.run('listAttempts', async () => {
      const rows = await this.db
        .select({
          attemptedAt: notificationDeliveryAttempts.attemptedAt,
          channel: notificationDeliveryAttempts.channel,
          outcome: notificationDeliveryAttempts.outcome,
          errorClass: notificationDeliveryAttempts.errorClass,
        })
        .from(notificationDeliveryAttempts)
        .where(eq(notificationDeliveryAttempts.intentId, id))
        .orderBy(
          asc(notificationDeliveryAttempts.attemptedAt),
          asc(notificationDeliveryAttempts.id),
        );

      return rows.map((row) => ({
        attemptedAt: row.attemptedAt,
        channel: row.channel,
        outcome: row.outcome as NotificationDeliveryOutcome,
        errorClass: row.errorClass ?? undefined,
      }));
    });
  }

  async countAttempts(id: IntentId): Promise<number> {
    return this.run('countAttempts', async () => {
      const [row] = await this.db
        .select({ total: count() })
        .from(notificationDeliveryAttempts)
        .where(eq(notificationDeliveryAttempts.intentId, id));
      return row?.total ?? 0;
    });
  }

  /**
   * Settles a claimed intent.
   *
   * Only a claimed intent may settle: a stale worker returning after its claim
   * was reassigned must not overwrite the outcome another worker recorded.
   */
  private async settle(id: IntentId, status: NotificationIntentState): Promise<void> {
    const rows = await this.db
      .update(notificationIntents)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(notificationIntents.id, id),
          inArray(notificationIntents.status, ['PENDING', 'PROCESSING']),
        ),
      )
      .returning({ id: notificationIntents.id });

    if (rows.length === 0) {
      throw guardViolationError(
        'NotificationIntentRepository.settle',
        'INTENT_ALREADY_SETTLED',
        'That notification intent has already been settled.',
      );
    }
  }

  private async loadByKey(intentKey: string): Promise<NotificationIntent | undefined> {
    const [row] = await this.db
      .select()
      .from(notificationIntents)
      .where(eq(notificationIntents.intentKey, intentKey))
      .limit(1);
    return row === undefined ? undefined : toIntent(row);
  }
}
