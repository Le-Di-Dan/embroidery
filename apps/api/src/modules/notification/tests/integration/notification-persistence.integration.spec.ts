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
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
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
    // `RequestContextModule` is `@Global()` but still has to be *in* the graph.
    // `APP4-B01` gave `RequestNotificationUseCase` a `RequestContextService`
    // dependency without adding it here, so this suite has failed to compile its
    // container since that checkpoint — every case, on the module build rather
    // than on an assertion. `APP4-B08` names the composition it needs to run,
    // which is a one-line test-graph fix, not a change to any production module.
    context = await createPersistenceTestContext('cp4-notification', [
      RequestContextModule,
      NotificationModule,
    ]);
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

  /**
   * The `APP4-B08` Admin support reads.
   *
   * Placed here, beside the other AGG-22 repository claims, because what they
   * have to prove is persistence behaviour: that the list filters and orders as
   * the contract says, that the timeline is chronological and deterministic, and
   * that the lock is a real `FOR UPDATE` rather than a plain read.
   */
  describe('Admin support reads', () => {
    it('lists newest first and filters by one lifecycle state', async () => {
      const first = await context.inTransaction(() =>
        intents.createIdempotent(createInput('admin-1')),
      );
      const second = await context.inTransaction(() =>
        intents.createIdempotent(createInput('admin-2')),
      );
      await context.inTransaction(() => intents.markFailed(second.intent.id));

      const all = await intents.listForAdmin({ limit: 50 });
      expect(all).toHaveLength(2);
      expect(all.map((row) => row.id)).toEqual([second.intent.id, first.intent.id]);

      const failed = await intents.listForAdmin({ status: 'FAILED', limit: 50 });
      expect(failed.map((row) => row.id)).toEqual([second.intent.id]);
      await expect(intents.listForAdmin({ status: 'CANCELLED', limit: 50 })).resolves.toEqual([]);

      // The limit is honoured, so a page cannot grow unbounded.
      await expect(intents.listForAdmin({ limit: 1 })).resolves.toHaveLength(1);
    });

    it('reads one intent with the fields a replay copies', async () => {
      const created = await context.inTransaction(() =>
        intents.createIdempotent(createInput('admin-read')),
      );

      const record = await intents.findById(created.intent.id);

      expect(record?.templateVersion).toBe(1);
      expect(record?.params).toEqual({ orderCode: 'ORD-1' });
      expect(record?.status).toBe('PENDING');
      expect(record?.createdAt).toBeInstanceOf(Date);
      await expect(intents.findById(newId() as IntentId)).resolves.toBeUndefined();
    });

    it('returns the attempt timeline oldest first', async () => {
      const created = await context.inTransaction(() =>
        intents.createIdempotent(createInput('admin-timeline')),
      );
      // Recorded newest-first on purpose: the ordering under test is the
      // query's, not the insertion order's.
      await context.inTransaction(async () => {
        await intents.recordAttempt({
          intentId: created.intent.id,
          channel: 'EMAIL',
          outcome: 'FAILED_TERMINAL',
          errorClass: 'CHANNEL_UNAVAILABLE',
          attemptedAt: new Date('2026-08-15T09:02:00.000Z'),
        });
        await intents.recordAttempt({
          intentId: created.intent.id,
          channel: 'EMAIL',
          outcome: 'FAILED_RETRYABLE',
          errorClass: 'TIMEOUT',
          attemptedAt: new Date('2026-08-15T09:00:00.000Z'),
        });
      });

      const timeline = await intents.listAttempts(created.intent.id);

      expect(timeline.map((attempt) => attempt.outcome)).toEqual([
        'FAILED_RETRYABLE',
        'FAILED_TERMINAL',
      ]);
      expect(timeline.map((attempt) => attempt.errorClass)).toEqual([
        'TIMEOUT',
        'CHANNEL_UNAVAILABLE',
      ]);
      // The provider reference is never projected: APP4 has no provider, and a
      // field that is always empty invites a provider body later.
      expect(Object.keys(timeline[0] ?? {}).sort()).toEqual([
        'attemptedAt',
        'channel',
        'errorClass',
        'outcome',
      ]);
    });

    it('locks an intent for update inside the caller transaction', async () => {
      const created = await context.inTransaction(() =>
        intents.createIdempotent(createInput('admin-lock')),
      );

      await expect(
        context.inTransaction(() => intents.lockById(created.intent.id)),
      ).resolves.toMatchObject({ id: created.intent.id, status: 'PENDING' });

      // `FOR UPDATE` is only legal inside a transaction; outside one the
      // repository refuses rather than silently degrading to a plain read,
      // which would make two concurrent replays both believe they were alone.
      await expect(intents.lockById(created.intent.id)).rejects.toThrow();
    });
  });
});
