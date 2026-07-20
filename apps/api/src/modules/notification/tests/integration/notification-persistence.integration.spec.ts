/**
 * AGG-22 Notification Intent persistence against a real PostgreSQL instance
 * (DB7-CP4).
 *
 * TBL-070, TBL-071 and guards G-DB7-48/49 (intentional no-FK references) and
 * G-DB7-58 (claim, attempt, settle). No exactly-once claim is proven —
 * multi-worker exclusivity is DB8.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { NotificationModule } from '../../notification.module';
import { NOTIFICATION_INTENT_REPOSITORY } from '../../domain/repositories/notification-intent.repository';
import type {
  IntentId,
  NotificationIntentRepository,
} from '../../domain/repositories/notification-intent.repository';

describe('notification persistence (integration)', () => {
  let context: PersistenceTestContext;
  let intents: NotificationIntentRepository;
  let contactPointId: string;
  let outboxEventId: bigint;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-notification', [NotificationModule]);
    intents = context.get(NOTIFICATION_INTENT_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();

    const customerId = newId();
    contactPointId = newId();
    await context.disposable.client.db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Notify Customer', now())
    `);
    await context.disposable.client.db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value, is_primary, verified_at, verified_source)
      values (${contactPointId}, ${customerId}, 'EMAIL', ${`n-${customerId}@example.com`},
              ${`n-${customerId}@example.com`}, true, now(), 'OTP')
    `);

    const [row] = (
      await context.disposable.client.db.execute<{ id: string }>(sql`
        insert into outbox_events
          (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version, status, attempt_count)
        values ('test.event', 'ORDER', ${newId()}, '{}'::jsonb, 1, 'PENDING', 0)
        returning id
      `)
    ).rows;
    outboxEventId = BigInt(row?.id ?? '0');
  });

  async function failureOf(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to fail, but it succeeded.');
  }

  const createInput = (intentKey: string, overrides: Record<string, unknown> = {}) => ({
    id: newId() as IntentId,
    intentKey,
    templateKey: 'order.deposit_paid',
    templateVersion: 1,
    channel: 'EMAIL',
    recipientMasked: 'n***@example.com',
    params: { orderCode: 'ORD-1' },
    correlationId: newId(),
    ...overrides,
  });

  describe('idempotent creation', () => {
    it('creates a new intent', async () => {
      const outcome = await context.inTransaction(() =>
        intents.createIdempotent(createInput('intent-1')),
      );

      expect(outcome.outcome).toBe('created');
      expect(outcome.intent.status).toBe('PENDING');
    });

    it('reports a duplicate intent key as a replay, not a failure', async () => {
      await context.inTransaction(() => intents.createIdempotent(createInput('intent-dup')));

      const outcome = await context.inTransaction(() =>
        intents.createIdempotent(createInput('intent-dup')),
      );

      expect(outcome.outcome).toBe('replay');
    });

    it('does not abort the enclosing transaction on a duplicate', async () => {
      await context.inTransaction(() => intents.createIdempotent(createInput('coexist')));

      const result = await context.inTransaction(async () => {
        const first = await intents.createIdempotent(createInput('coexist'));
        const second = await intents.createIdempotent(createInput('second'));
        return { first, second };
      });

      expect(result.first.outcome).toBe('replay');
      expect(result.second.outcome).toBe('created');
    });

    it('resolves an optional recipient contact point when present (G-DB7-48)', async () => {
      const outcome = await context.inTransaction(() =>
        intents.createIdempotent(
          createInput('with-contact', { recipientContactPointId: contactPointId }),
        ),
      );

      expect(outcome.outcome).toBe('created');
    });

    it('rejects a recipient contact point that does not exist (G-DB7-48)', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          intents.createIdempotent(
            createInput('bad-contact', { recipientContactPointId: newId() }),
          ),
        ),
      );

      expect(error.code).toBe('RECIPIENT_CONTACT_NOT_FOUND');
    });

    it('resolves an optional source outbox event when present (G-DB7-49)', async () => {
      const outcome = await context.inTransaction(() =>
        intents.createIdempotent(
          createInput('with-source', { sourceOutboxEventId: outboxEventId }),
        ),
      );

      expect(outcome.outcome).toBe('created');
    });

    it('rejects a source outbox event that does not exist (G-DB7-49)', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          intents.createIdempotent(createInput('bad-source', { sourceOutboxEventId: 999999999n })),
        ),
      );

      expect(error.code).toBe('SOURCE_EVENT_NOT_FOUND');
    });

    it('refuses to create outside a transaction', async () => {
      await expect(intents.createIdempotent(createInput('no-tx'))).rejects.toThrow(
        /must run inside a transaction/,
      );
    });
  });

  describe('claim, attempt, settle (G-DB7-58)', () => {
    it('claims pending intents and marks them processing', async () => {
      await context.inTransaction(() => intents.createIdempotent(createInput('claim-1')));
      await context.inTransaction(() => intents.createIdempotent(createInput('claim-2')));

      const claimed = await context.inTransaction(() => intents.claimBatch(10));

      expect(claimed).toHaveLength(2);
      expect(claimed.every((intent) => intent.status === 'PROCESSING')).toBe(true);
    });

    it('does not re-claim an already-processing intent', async () => {
      await context.inTransaction(() => intents.createIdempotent(createInput('claim-once')));
      await context.inTransaction(() => intents.claimBatch(10));

      const secondClaim = await context.inTransaction(() => intents.claimBatch(10));

      expect(secondClaim).toEqual([]);
    });

    it('records a delivery attempt', async () => {
      const created = await context.inTransaction(() =>
        intents.createIdempotent(createInput('attempt-1')),
      );
      const intentId = created.intent.id;

      await context.inTransaction(() =>
        intents.recordAttempt({
          intentId,
          channel: 'EMAIL',
          outcome: 'DELIVERED',
          providerMessageRef: 'msg-1',
          attemptedAt: new Date(),
        }),
      );

      await expect(intents.countAttempts(intentId)).resolves.toBe(1);
    });

    it('marks an intent delivered exactly once', async () => {
      const created = await context.inTransaction(() =>
        intents.createIdempotent(createInput('deliver-once')),
      );
      await context.inTransaction(() => intents.markDelivered(created.intent.id));

      // A stale worker returning after reassignment must not overwrite the
      // outcome another worker recorded.
      const error = await failureOf(() =>
        context.inTransaction(() => intents.markDelivered(created.intent.id)),
      );

      expect(error.code).toBe('INTENT_ALREADY_SETTLED');
    });

    it('marks an intent failed', async () => {
      const created = await context.inTransaction(() =>
        intents.createIdempotent(createInput('fail-me')),
      );

      await context.inTransaction(() => intents.markFailed(created.intent.id));

      await expect(intents.findByIntentKey('fail-me')).resolves.toMatchObject({
        status: 'FAILED',
      });
    });

    it('refuses to settle an intent that was never claimed or created', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() => intents.markDelivered(newId() as IntentId)),
      );

      expect(error.code).toBe('INTENT_ALREADY_SETTLED');
    });
  });
});
