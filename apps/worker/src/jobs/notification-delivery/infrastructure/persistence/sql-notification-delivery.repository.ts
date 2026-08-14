/**
 * Notification delivery persistence (`APP4-W01`).
 *
 * Raw SQL through the database package's sanctioned boundary, exactly as the
 * Asset repositories do: the worker depends on `@embroidery/database` and
 * `@embroidery/persistence`, never on Drizzle or the driver, and never on
 * `apps/api`.
 *
 * Every write states its own from-state in its own `WHERE` clause. The runtime
 * is at-least-once, so a second attempt at one intent can overlap a first, and
 * an update matching zero rows is not a retry to paper over — it is proof that
 * another attempt already moved the row.
 *
 * Two things this file must never do, both one line away:
 *
 * - **write anything from the plaintext.** No column here receives the secret,
 *   the real recipient or a provider body; `error_class` takes a bounded class
 *   and `provider_message_ref` is not written at all until a real provider
 *   exists to give one.
 * - **reopen a terminal intent.** `settle` matches `PENDING`/`PROCESSING` only,
 *   so `FAILED → PENDING` is not expressible here — a replay is a new intent
 *   (`ADR-APP4-001` §8.2).
 */
import { Injectable } from '@nestjs/common';
import { executeRaw, sql } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';

import type {
  CurrentNotificationIntent,
  NotificationDeliveryRepository,
  NotificationIntentStatus,
  SettleAttemptInput,
} from '../../domain/repositories/notification-delivery.repository';

interface IntentRow extends Record<string, unknown> {
  readonly id: string;
  readonly channel: string;
  readonly status: string;
}

@Injectable()
export class SqlNotificationDeliveryRepository
  extends DrizzleRepository
  implements NotificationDeliveryRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findIntent(intentId: string): Promise<CurrentNotificationIntent | undefined> {
    return this.run('findIntent', async () => {
      const rows = await executeRaw<IntentRow>(
        this.db,
        sql`SELECT id, channel, status FROM notification_intents WHERE id = ${intentId}`,
      );
      const row = rows[0];
      return row === undefined
        ? undefined
        : {
            id: row.id,
            channel: row.channel,
            status: row.status as NotificationIntentStatus,
          };
    });
  }

  async beginProcessing(intentId: string): Promise<boolean> {
    return this.run('beginProcessing', async () => {
      const rows = await executeRaw<{ id: string }>(
        this.db,
        sql`
          UPDATE notification_intents
          SET status = 'PROCESSING', updated_at = now()
          WHERE id = ${intentId} AND status = 'PENDING'
          RETURNING id
        `,
      );
      return rows.length > 0;
    });
  }

  async settleAttempt(input: SettleAttemptInput): Promise<void> {
    // Both statements or neither: an evidence row whose intent state disagrees
    // with it is worse than no evidence, because an operator would believe it.
    this.requireTransaction('settleAttempt');
    return this.run('settleAttempt', async () => {
      await executeRaw(
        this.db,
        sql`
          INSERT INTO notification_delivery_attempts
            (intent_id, channel, outcome, error_class, attempted_at)
          VALUES (
            ${input.intentId}, ${input.channel}, ${input.outcome},
            ${input.failure ?? null}, ${input.attemptedAt}
          )
        `,
      );

      if (input.settleTo === undefined) {
        return;
      }

      const rows = await executeRaw<{ id: string }>(
        this.db,
        sql`
          UPDATE notification_intents
          SET status = ${input.settleTo}, updated_at = now()
          WHERE id = ${input.intentId} AND status IN ('PENDING', 'PROCESSING')
          RETURNING id
        `,
      );
      if (rows.length === 0) {
        // The intent settled underneath this attempt. Rolling back takes the
        // evidence row with it, which is correct: the attempt this worker
        // believes it made is not the one that decided the outcome.
        throw new Error('The notification intent was already settled by another attempt.');
      }
    });
  }
}
