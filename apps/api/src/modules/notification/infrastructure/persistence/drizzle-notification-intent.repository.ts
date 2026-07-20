/**
 * Drizzle implementation of the AGG-22 Notification Intent contract
 * (TBL-070, TBL-071).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { NotificationDeliveryOutcome, NotificationIntentState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, count, eq, inArray } from 'drizzle-orm';

import type {
  CreateIntentInput,
  CreateIntentOutcome,
  IntentId,
  NotificationIntent,
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
