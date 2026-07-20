/**
 * CTX-PLT platform persistence against a real PostgreSQL instance (DB7-CP3).
 *
 * Covers TBL-073..077. The idempotency/outbox *protocol* behaviour — replay,
 * atomicity with a domain write, worker claim loops — is exercised more fully
 * in CP6; this suite proves the persistence primitives those flows stand on.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import { sql } from 'drizzle-orm';

import { DatabaseModule } from '../database.module';
import { TransactionManager } from '../transaction/transaction-manager';
import { IdempotencyStore } from './idempotency-store';
import { OutboxEventStore } from './outbox-event-store';
import { BackgroundJobAttemptStore } from './background-job-attempt-store';
import { PolicyConfigurationRepository } from './policy-configuration.repository';

const HOUR_MS = 60 * 60 * 1000;

describe('platform primitives (integration)', () => {
  let disposable: DisposableDatabase;
  let moduleRef: TestingModule;
  let transactions: TransactionManager;
  let idempotency: IdempotencyStore;
  let outbox: OutboxEventStore;
  let jobs: BackgroundJobAttemptStore;
  let policies: PolicyConfigurationRepository;
  let previousUrl: string | undefined;
  let adminId: string;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('cp3-platform');
    previousUrl = process.env['DATABASE_URL'];
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';

    moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    await moduleRef.init();
    transactions = moduleRef.get(TransactionManager);
    idempotency = moduleRef.get(IdempotencyStore);
    outbox = moduleRef.get(OutboxEventStore);
    jobs = moduleRef.get(BackgroundJobAttemptStore);
    policies = moduleRef.get(PolicyConfigurationRepository);
  }, 120_000);

  afterAll(async () => {
    await moduleRef?.close();
    if (previousUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousUrl;
    }
    await disposable?.drop();
  });

  beforeEach(async () => {
    await truncateAllTables(disposable.client.db);
    // Policy versions carry a real admin FK, so every suite needs one.
    adminId = newId();
    await disposable.client.db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, 'platform@example.com', 'Platform', 'ACTIVE')
    `);
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

  const key = (scopeKey: string, fingerprint = 'fp-1') => ({
    namespace: 'payment.callback',
    scopeKey,
    fingerprint,
  });

  const expiry = () => new Date(Date.now() + HOUR_MS);

  describe('idempotency store', () => {
    it('claims an unused key', async () => {
      const claim = await transactions.runInTransaction(() =>
        idempotency.claim(key('first'), expiry()),
      );

      expect(claim.outcome).toBe('claimed');
    });

    it('reports in_progress while the first attempt is still running', async () => {
      await transactions.runInTransaction(() => idempotency.claim(key('running'), expiry()));

      const second = await transactions.runInTransaction(() =>
        idempotency.claim(key('running'), expiry()),
      );

      expect(second.outcome).toBe('in_progress');
    });

    it('replays the stored result once the operation completed', async () => {
      await transactions.runInTransaction(async () => {
        await idempotency.claim(key('done'), expiry());
        await idempotency.complete(key('done'), { orderId: 'order-1' });
      });

      const replay = await transactions.runInTransaction(() =>
        idempotency.claim(key('done'), expiry()),
      );

      expect(replay).toEqual({ outcome: 'replay', result: { orderId: 'order-1' } });
    });

    it('rejects the same key used for different work (GRD-030)', async () => {
      await transactions.runInTransaction(() => idempotency.claim(key('reused', 'fp-a'), expiry()));

      const error = await failureOf(() =>
        transactions.runInTransaction(() => idempotency.claim(key('reused', 'fp-b'), expiry())),
      );

      expect(error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });

    it('does not abort the enclosing transaction on a duplicate claim', async () => {
      await transactions.runInTransaction(() => idempotency.claim(key('coexist'), expiry()));

      // The duplicate claim must not poison the transaction: a caught 23505
      // would have left it unusable, which is why the insert uses
      // onConflictDoNothing rather than a try/catch.
      const result = await transactions.runInTransaction(async () => {
        const claim = await idempotency.claim(key('coexist'), expiry());
        const record = await idempotency.find(key('coexist'));
        return { claim, record };
      });

      expect(result.claim.outcome).toBe('in_progress');
      expect(result.record?.status).toBe('IN_PROGRESS');
    });

    it('rolls the claim back with the work it guards', async () => {
      await expect(
        transactions.runInTransaction(async () => {
          await idempotency.claim(key('rolled-back'), expiry());
          throw new Error('domain work failed');
        }),
      ).rejects.toThrow('domain work failed');

      // Nothing to replay: a claim must never survive work that did not happen.
      await expect(idempotency.find(key('rolled-back'))).resolves.toBeUndefined();
    });

    it('refuses to complete a claim it does not hold', async () => {
      const error = await failureOf(() =>
        transactions.runInTransaction(() => idempotency.complete(key('never-claimed'), {})),
      );

      expect(error.code).toBe('IDEMPOTENCY_CLAIM_NOT_HELD');
    });

    it('refuses to complete twice, so a late retry cannot overwrite a published result', async () => {
      await transactions.runInTransaction(async () => {
        await idempotency.claim(key('once'), expiry());
        await idempotency.complete(key('once'), { value: 'first' });
      });

      const error = await failureOf(() =>
        transactions.runInTransaction(() => idempotency.complete(key('once'), { value: 'second' })),
      );

      expect(error.code).toBe('IDEMPOTENCY_CLAIM_NOT_HELD');
      await expect(idempotency.find(key('once'))).resolves.toMatchObject({
        result: { value: 'first' },
      });
    });

    it('releases a claim so a retry can take it', async () => {
      await transactions.runInTransaction(() => idempotency.claim(key('retry'), expiry()));
      await idempotency.release(key('retry'));

      const second = await transactions.runInTransaction(() =>
        idempotency.claim(key('retry'), expiry()),
      );

      expect(second.outcome).toBe('claimed');
    });

    it('refuses to claim outside a transaction', async () => {
      await expect(idempotency.claim(key('no-tx'), expiry())).rejects.toThrow(
        /must run inside a transaction/,
      );
    });
  });

  describe('outbox event store', () => {
    const event = (aggregateId: string) =>
      ({
        eventType: 'order.created',
        aggregateKind: 'ORDER',
        aggregateId,
        payload: { orderId: aggregateId },
        payloadSchemaVersion: 1,
      }) as const;

    it('appends an event inside the caller transaction', async () => {
      const id = newId();
      await transactions.runInTransaction(() => outbox.append(event(id)));

      const events = await outbox.listForAggregate('ORDER', id);
      expect(events).toHaveLength(1);
      expect(events[0]?.status).toBe('PENDING');
    });

    it('rolls the event back when the domain work fails', async () => {
      const id = newId();

      await expect(
        transactions.runInTransaction(async () => {
          await outbox.append(event(id));
          throw new Error('domain write failed after the outbox insert');
        }),
      ).rejects.toThrow();

      // The whole point of the pattern: no event may survive work that rolled back.
      await expect(outbox.listForAggregate('ORDER', id)).resolves.toEqual([]);
    });

    it('refuses to append outside a transaction', async () => {
      await expect(outbox.append(event(newId()))).rejects.toThrow(/must run inside a transaction/);
    });

    it('rejects an unrecognised aggregate kind (G-DB7-47)', async () => {
      const error = await failureOf(() =>
        transactions.runInTransaction(() =>
          outbox.append({ ...event(newId()), aggregateKind: 'MYSTERY' as never }),
        ),
      );

      expect(error.code).toBe('UNKNOWN_AGGREGATE_KIND');
    });

    it('claims due events and increments the attempt count', async () => {
      const first = newId();
      const second = newId();
      await transactions.runInTransaction(async () => {
        await outbox.append(event(first));
        await outbox.append(event(second));
      });

      const claimed = await transactions.runInTransaction(() => outbox.claimBatch('worker-1', 10));

      expect(claimed).toHaveLength(2);
      expect(claimed[0]?.attemptCount).toBe(1);
      expect(claimed.map((e) => e.aggregateId)).toEqual([first, second]);
    });

    it('bounds a claim batch so one worker cannot take the whole queue', async () => {
      await transactions.runInTransaction(async () => {
        for (let index = 0; index < 5; index += 1) {
          await outbox.append(event(newId()));
        }
      });

      const claimed = await transactions.runInTransaction(() => outbox.claimBatch('worker-1', 2));

      expect(claimed).toHaveLength(2);
    });

    it('marks a dispatched event and stops claiming it', async () => {
      const id = newId();
      await transactions.runInTransaction(() => outbox.append(event(id)));
      const [claimed] = await transactions.runInTransaction(() =>
        outbox.claimBatch('worker-1', 10),
      );

      await transactions.runInTransaction(() => outbox.markDispatched(claimed?.id as bigint));

      const remaining = await transactions.runInTransaction(() =>
        outbox.claimBatch('worker-1', 10),
      );
      expect(remaining).toEqual([]);
      await expect(outbox.listForAggregate('ORDER', id)).resolves.toMatchObject([
        { status: 'DISPATCHED' },
      ]);
    });

    it('does not re-claim a retry before its next attempt is due', async () => {
      const id = newId();
      await transactions.runInTransaction(() => outbox.append(event(id)));
      const [claimed] = await transactions.runInTransaction(() =>
        outbox.claimBatch('worker-1', 10),
      );

      await transactions.runInTransaction(() =>
        outbox.scheduleRetry(claimed?.id as bigint, new Date(Date.now() + HOUR_MS), 'TIMEOUT'),
      );

      const tooSoon = await transactions.runInTransaction(() => outbox.claimBatch('worker-1', 10));
      expect(tooSoon).toEqual([]);
    });

    it('re-claims a retry once it becomes due', async () => {
      const id = newId();
      await transactions.runInTransaction(() => outbox.append(event(id)));
      const [claimed] = await transactions.runInTransaction(() =>
        outbox.claimBatch('worker-1', 10),
      );
      await transactions.runInTransaction(() =>
        outbox.scheduleRetry(claimed?.id as bigint, new Date(Date.now() - 1000), 'TIMEOUT'),
      );

      const again = await transactions.runInTransaction(() => outbox.claimBatch('worker-1', 10));

      expect(again).toHaveLength(1);
      expect(again[0]?.attemptCount).toBe(2);
    });

    it('stops claiming a dead-lettered event', async () => {
      const id = newId();
      await transactions.runInTransaction(() => outbox.append(event(id)));
      const [claimed] = await transactions.runInTransaction(() =>
        outbox.claimBatch('worker-1', 10),
      );

      await transactions.runInTransaction(() =>
        outbox.markDeadLetter(claimed?.id as bigint, 'PERMANENT_REJECT'),
      );

      await expect(
        transactions.runInTransaction(() => outbox.claimBatch('worker-1', 10)),
      ).resolves.toEqual([]);
      await expect(outbox.listForAggregate('ORDER', id)).resolves.toMatchObject([
        { status: 'DEAD_LETTER' },
      ]);
    });

    it('rejects a payload mutation via the S24 column-scoped trigger', async () => {
      const id = newId();
      await transactions.runInTransaction(() => outbox.append(event(id)));

      // Direct SQL, deliberately: the store has no method for this, so the
      // assertion is that the *database* refuses even when the code is bypassed.
      // Mapped explicitly because this call path skips the repository funnel.
      const error = await failureOf(() =>
        withMappedErrors('probe.tamperOutboxPayload', () =>
          disposable.client.db.execute(
            sql`update outbox_events set payload = '{"tampered":true}'::jsonb where aggregate_id = ${id}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
      expect(error.diagnostics.sqlState).toBe('23000');
    });
  });

  describe('background job attempts', () => {
    it('records an attempt', async () => {
      const recorded = await jobs.record({
        jobKind: 'OUTBOX_DISPATCH',
        jobKey: 'event-1',
        attemptNo: 1,
        outcome: 'SUCCEEDED',
      });

      expect(recorded.attemptNo).toBe(1);
      expect(recorded.isDeadLetter).toBe(false);
    });

    it('derives dead-letter from a terminal outcome rather than trusting the caller', async () => {
      const recorded = await jobs.record({
        jobKind: 'NOTIFICATION_DELIVERY',
        jobKey: 'intent-1',
        attemptNo: 3,
        outcome: 'FAILED_TERMINAL',
        errorClass: 'PROVIDER_REJECTED',
      });

      expect(recorded.isDeadLetter).toBe(true);
      await expect(jobs.listDeadLetters('NOTIFICATION_DELIVERY')).resolves.toHaveLength(1);
    });

    it('lists attempts newest-first', async () => {
      for (const attemptNo of [1, 2, 3]) {
        await jobs.record({
          jobKind: 'ASSET_PROCESSING',
          jobKey: 'asset-1',
          attemptNo,
          outcome: attemptNo === 3 ? 'SUCCEEDED' : 'FAILED_RETRYABLE',
        });
      }

      const attempts = await jobs.listAttempts('ASSET_PROCESSING', 'asset-1');

      expect(attempts.map((a) => a.attemptNo)).toEqual([3, 2, 1]);
    });

    it('rejects a duplicate attempt number for the same work item', async () => {
      await jobs.record({
        jobKind: 'ASSET_PROCESSING',
        jobKey: 'asset-dup',
        attemptNo: 1,
        outcome: 'SUCCEEDED',
      });

      const error = await failureOf(() =>
        jobs.record({
          jobKind: 'ASSET_PROCESSING',
          jobKey: 'asset-dup',
          attemptNo: 1,
          outcome: 'SUCCEEDED',
        }),
      );

      expect(error.code).toBe('JOB_ATTEMPT_ALREADY_RECORDED');
      expect(error.replayable).toBe(true);
    });

    it('rejects an unrecognised job kind (G-DB7-51)', async () => {
      const error = await failureOf(() =>
        jobs.record({
          jobKind: 'MYSTERY_JOB' as never,
          jobKey: 'x',
          attemptNo: 1,
          outcome: 'SUCCEEDED',
        }),
      );

      expect(error.code).toBe('UNKNOWN_JOB_KIND');
    });

    it('rejects a non-positive attempt number', async () => {
      const error = await failureOf(() =>
        jobs.record({
          jobKind: 'SESSION_CLEANUP',
          jobKey: 'sweep',
          attemptNo: 0,
          outcome: 'SUCCEEDED',
        }),
      );

      expect(error.diagnostics.constraint).toBe('ck_background_job_attempts__attempt_no_positive');
    });

    it('survives the failure it describes, because it is not in that transaction', async () => {
      await transactions
        .runInTransaction(async () => {
          await jobs.record({
            jobKind: 'OUTBOX_DISPATCH',
            jobKey: 'survives',
            attemptNo: 1,
            outcome: 'FAILED_RETRYABLE',
            errorClass: 'TIMEOUT',
          });
          throw new Error('the job failed');
        })
        .catch(() => undefined);

      // The evidence is the point: it must outlive the rollback of the work.
      const attempts = await jobs.listAttempts('OUTBOX_DISPATCH', 'survives');
      expect(attempts).toHaveLength(1);
    });
  });

  describe('policy configuration', () => {
    const publish = (value: Record<string, unknown>, effectiveFrom = new Date()) =>
      transactions.runInTransaction(() =>
        policies.publishVersion({
          configKey: 'quotation.expiry',
          value,
          valueSchemaVersion: 1,
          effectiveFrom,
          createdByAdminId: adminId,
          reason: 'initial',
        }),
      );

    beforeEach(async () => {
      await transactions.runInTransaction(() =>
        policies.ensureKey('quotation.expiry', 'How long a sent quotation stays acceptable'),
      );
    });

    it('creates a key idempotently', async () => {
      const again = await transactions.runInTransaction(() =>
        policies.ensureKey('quotation.expiry', 'ignored on the second call'),
      );

      expect(again.configKey).toBe('quotation.expiry');
    });

    it('publishes a version and makes it current', async () => {
      const version = await publish({ days: 14 });

      const current = await policies.currentValue('quotation.expiry');
      expect(version.version).toBe(1);
      expect(current?.value).toEqual({ days: 14 });
    });

    it('numbers successive versions without gaps', async () => {
      await publish({ days: 14 });
      const second = await publish({ days: 21 });

      expect(second.version).toBe(2);
      await expect(policies.currentValue('quotation.expiry')).resolves.toMatchObject({
        value: { days: 21 },
      });
    });

    it('rolls back to an earlier version of the same configuration', async () => {
      const first = await publish({ days: 14 });
      await publish({ days: 21 });
      const configuration = await policies.findByKey('quotation.expiry');

      await transactions.runInTransaction(() =>
        policies.setCurrentVersion(configuration?.id as string, first.id),
      );

      await expect(policies.currentValue('quotation.expiry')).resolves.toMatchObject({
        value: { days: 14 },
      });
    });

    it('refuses a version belonging to another configuration (G-DB7-08)', async () => {
      const mine = await publish({ days: 14 });
      await transactions.runInTransaction(() => policies.ensureKey('other.key', 'Another policy'));
      const other = await policies.findByKey('other.key');

      // The FK proves this version exists; only the application can prove it
      // belongs somewhere else.
      const error = await failureOf(() =>
        transactions.runInTransaction(() =>
          policies.setCurrentVersion(other?.id as string, mine.id),
        ),
      );

      expect(error.code).toBe('VERSION_BELONGS_TO_ANOTHER_CONFIGURATION');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });

    it('reports a version that does not exist', async () => {
      const configuration = await policies.findByKey('quotation.expiry');

      const error = await failureOf(() =>
        transactions.runInTransaction(() =>
          policies.setCurrentVersion(configuration?.id as string, newId()),
        ),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('resolves the version in force at a past instant', async () => {
      const old = new Date(Date.now() - 2 * HOUR_MS);
      await publish({ days: 7 }, old);
      await publish({ days: 30 }, new Date());

      const then = await policies.versionEffectiveAt(
        'quotation.expiry',
        new Date(Date.now() - HOUR_MS),
      );

      expect(then?.value).toEqual({ days: 7 });
    });

    it('returns nothing when no version was yet effective', async () => {
      await publish({ days: 7 }, new Date(Date.now() + HOUR_MS));

      await expect(
        policies.versionEffectiveAt('quotation.expiry', new Date()),
      ).resolves.toBeUndefined();
    });

    it('rejects a version whose author is not a real admin', async () => {
      const error = await failureOf(() =>
        transactions.runInTransaction(() =>
          policies.publishVersion({
            configKey: 'quotation.expiry',
            value: { days: 1 },
            valueSchemaVersion: 1,
            effectiveFrom: new Date(),
            createdByAdminId: newId(),
            reason: 'orphan author',
          }),
        ),
      );

      expect(error.kind).toBe('INVALID_REFERENCE');
      expect(error.diagnostics.sqlState).toBe('23503');
    });
  });
});
