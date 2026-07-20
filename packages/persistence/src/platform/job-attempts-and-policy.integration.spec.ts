/**
 * TBL-075..077 persistence against a real PostgreSQL instance (DB7-CP3).
 *
 * Worker attempt evidence and versioned business policy configuration. They
 * share a suite because both are small and neither depends on the other; the
 * larger platform stores have suites of their own.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';

import { createPlatformTestContext } from '../testing/platform-test-context';
import type { PlatformTestContext } from '../testing/platform-test-context';
import { BackgroundJobAttemptStore } from './background-job-attempt-store';
import { PolicyConfigurationRepository } from './policy-configuration.repository';

const HOUR_MS = 60 * 60 * 1000;

describe('job attempts and policy configuration (integration)', () => {
  let context: PlatformTestContext;
  let jobs: BackgroundJobAttemptStore;
  let policies: PolicyConfigurationRepository;
  let adminId: string;

  beforeAll(async () => {
    context = await createPlatformTestContext('cp3-jobs-policy');
    jobs = context.get(BackgroundJobAttemptStore);
    policies = context.get(PolicyConfigurationRepository);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    adminId = await context.seedAdmin();
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
      await context
        .inTransaction(async () => {
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
      context.inTransaction(() =>
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
      await context.inTransaction(() =>
        policies.ensureKey('quotation.expiry', 'How long a sent quotation stays acceptable'),
      );
    });

    it('creates a key idempotently', async () => {
      const again = await context.inTransaction(() =>
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

      await context.inTransaction(() =>
        policies.setCurrentVersion(configuration?.id as string, first.id),
      );

      await expect(policies.currentValue('quotation.expiry')).resolves.toMatchObject({
        value: { days: 14 },
      });
    });

    it('refuses a version belonging to another configuration (G-DB7-08)', async () => {
      const mine = await publish({ days: 14 });
      await context.inTransaction(() => policies.ensureKey('other.key', 'Another policy'));
      const other = await policies.findByKey('other.key');

      // The FK proves this version exists; only the application can prove it
      // belongs somewhere else.
      const error = await failureOf(() =>
        context.inTransaction(() => policies.setCurrentVersion(other?.id as string, mine.id)),
      );

      expect(error.code).toBe('VERSION_BELONGS_TO_ANOTHER_CONFIGURATION');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });

    it('reports a version that does not exist', async () => {
      const configuration = await policies.findByKey('quotation.expiry');

      const error = await failureOf(() =>
        context.inTransaction(() =>
          policies.setCurrentVersion(configuration?.id as string, newId()),
        ),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('resolves the version in force at a past instant', async () => {
      await publish({ days: 7 }, new Date(Date.now() - 2 * HOUR_MS));
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
        context.inTransaction(() =>
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
