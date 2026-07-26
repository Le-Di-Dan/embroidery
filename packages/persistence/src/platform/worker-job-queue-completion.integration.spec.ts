/**
 * APP2-I02 §17 cases 10–18 and 22 — completion transactions against a real
 * PostgreSQL.
 *
 * The point of every case here is atomicity and guard behaviour, which no
 * in-memory double can demonstrate: the `background_job_attempts` uniqueness,
 * the outbox status check constraint and the CST-099 column-scoped trigger are
 * all enforced by the database, not by this code.
 */
import type { PlatformTestContext } from '../testing/platform-test-context';
import { createPlatformTestContext } from '../testing/platform-test-context';
import { WorkerJobQueueRepository } from './worker-job-queue.repository';
import type { ClaimedWorkerJob, RegisteredJobType } from './worker-job-queue.types';
import {
  SYNTHETIC_EVENT_ALPHA,
  SYNTHETIC_JOB_KIND,
  readAttempts,
  readOutboxRow,
  seedOutboxEvent,
} from '../testing/worker-queue-test-support';

const REGISTERED: readonly RegisteredJobType[] = [
  { eventType: SYNTHETIC_EVENT_ALPHA, jobKind: SYNTHETIC_JOB_KIND },
];

const LEASE_MS = 60_000;
const WORKER_A = 'worker:test-a:1:aaaa';
const WORKER_B = 'worker:test-b:2:bbbb';
const PAYLOAD = { marker: 'i02', nested: { keep: true } };

describe('worker job queue — completion (integration)', () => {
  let context: PlatformTestContext;
  let queue: WorkerJobQueueRepository;

  beforeAll(async () => {
    context = await createPlatformTestContext('worker-queue-completion');
    queue = context.get(WorkerJobQueueRepository);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
  });

  const guardOf = (job: ClaimedWorkerJob) => ({
    outboxEventId: job.outboxEventId,
    workerInstanceId: WORKER_A,
    attemptNo: job.attemptNo,
    jobKind: SYNTHETIC_JOB_KIND,
  });

  /** Seeds one fresh event and claims it as WORKER_A. */
  async function claimOne(): Promise<ClaimedWorkerJob> {
    await seedOutboxEvent(context.disposable, {
      nextAttemptOffsetSeconds: null,
      payload: PAYLOAD,
    });
    const [job] = await context.inTransaction(() =>
      queue.claimRegisteredBatch({
        workerInstanceId: WORKER_A,
        registeredTypes: REGISTERED,
        batchSize: 5,
        leaseDurationMs: LEASE_MS,
      }),
    );
    if (job === undefined) {
      throw new Error('Setup failed: nothing was claimed.');
    }
    return job;
  }

  it('case 10 — success writes the attempt and DISPATCHED atomically', async () => {
    const job = await claimOne();

    const result = await context.inTransaction(() => queue.completeSucceededAttempt(guardOf(job)));

    expect(result).toEqual({ outcome: 'COMPLETED' });

    const row = await readOutboxRow(context.disposable, job.outboxEventId);
    expect(row.status).toBe('DISPATCHED');
    expect(row.dispatchedAt).not.toBeNull();
    expect(row.nextAttemptAt).toBeNull();
    expect(row.claimedBy).toBeNull();
    expect(row.claimedAt).toBeNull();
    expect(row.lastError).toBeNull();

    expect(await readAttempts(context.disposable, job.outboxEventId)).toEqual([
      {
        jobKind: SYNTHETIC_JOB_KIND,
        jobKey: job.outboxEventId.toString(),
        attemptNo: 1,
        outcome: 'SUCCEEDED',
        isDeadLetter: false,
        errorClass: null,
      },
    ]);
  });

  it('case 11 — a retryable failure writes the attempt and PENDING backoff atomically', async () => {
    const job = await claimOne();

    const result = await context.inTransaction(() =>
      queue.completeRetryableAttempt({
        ...guardOf(job),
        retryDelayMs: 30_000,
        errorClass: 'JOB_TRANSIENT_FAILURE',
      }),
    );

    expect(result).toEqual({ outcome: 'COMPLETED' });

    const row = await readOutboxRow(context.disposable, job.outboxEventId);
    expect(row.status).toBe('PENDING');
    expect(row.claimedBy).toBeNull();
    expect(row.claimedAt).toBeNull();
    expect(row.lastError).toBe('JOB_TRANSIENT_FAILURE');
    expect(row.nextAttemptAt).not.toBeNull();
    expect((row.nextAttemptAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(10_000);

    const attempts = await readAttempts(context.disposable, job.outboxEventId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILED_RETRYABLE');
    expect(attempts[0]?.isDeadLetter).toBe(false);
  });

  it('case 12 — a retried event becomes claimable again once its deadline passes', async () => {
    const job = await claimOne();
    await context.inTransaction(() =>
      queue.completeRetryableAttempt({
        ...guardOf(job),
        // Negative delay places the deadline in the past: the alternative is a
        // real sleep, which would make the suite slow and flaky for no gain.
        retryDelayMs: -1_000,
        errorClass: 'JOB_TRANSIENT_FAILURE',
      }),
    );

    const reclaimed = await context.inTransaction(() =>
      queue.claimRegisteredBatch({
        workerInstanceId: WORKER_B,
        registeredTypes: REGISTERED,
        batchSize: 5,
        leaseDurationMs: LEASE_MS,
      }),
    );

    expect(reclaimed.map((claimed) => claimed.outboxEventId)).toEqual([job.outboxEventId]);
    expect(reclaimed[0]?.attemptNo).toBe(2);
  });

  it('case 13 — no completion path can ever emit FAILED', async () => {
    const succeeded = await claimOne();
    await context.inTransaction(() => queue.completeSucceededAttempt(guardOf(succeeded)));

    const retried = await claimOne();
    await context.inTransaction(() =>
      queue.completeRetryableAttempt({
        ...guardOf(retried),
        retryDelayMs: 1_000,
        errorClass: 'JOB_TRANSIENT_FAILURE',
      }),
    );

    const terminal = await claimOne();
    await context.inTransaction(() =>
      queue.completeTerminalAttempt({
        ...guardOf(terminal),
        errorClass: 'JOB_INVARIANT_VIOLATION',
      }),
    );

    const statuses = await Promise.all(
      [succeeded, retried, terminal].map(
        async (job) => (await readOutboxRow(context.disposable, job.outboxEventId)).status,
      ),
    );
    expect(statuses).toEqual(['DISPATCHED', 'PENDING', 'DEAD_LETTER']);
    expect(statuses).not.toContain('FAILED');
  });

  it('case 14 — a terminal failure dead-letters the event', async () => {
    const job = await claimOne();

    const result = await context.inTransaction(() =>
      queue.completeTerminalAttempt({ ...guardOf(job), errorClass: 'JOB_PAYLOAD_INVALID' }),
    );

    expect(result).toEqual({ outcome: 'COMPLETED' });

    const row = await readOutboxRow(context.disposable, job.outboxEventId);
    expect(row.status).toBe('DEAD_LETTER');
    expect(row.nextAttemptAt).toBeNull();
    expect(row.claimedBy).toBeNull();
    expect(row.lastError).toBe('JOB_PAYLOAD_INVALID');

    const attempts = await readAttempts(context.disposable, job.outboxEventId);
    expect(attempts[0]?.outcome).toBe('FAILED_TERMINAL');
    expect(attempts[0]?.isDeadLetter).toBe(true);
  });

  it('case 15 — a dead-lettered event is never claimed again', async () => {
    const job = await claimOne();
    await context.inTransaction(() =>
      queue.completeTerminalAttempt({ ...guardOf(job), errorClass: 'JOB_PAYLOAD_INVALID' }),
    );

    const claimed = await context.inTransaction(() =>
      queue.claimRegisteredBatch({
        workerInstanceId: WORKER_B,
        registeredTypes: REGISTERED,
        batchSize: 5,
        leaseDurationMs: LEASE_MS,
      }),
    );

    expect(claimed).toEqual([]);
  });

  it('case 16 — a completion from a worker that no longer owns the lease is rejected', async () => {
    const job = await claimOne();

    const result = await context.inTransaction(() =>
      queue.completeSucceededAttempt({ ...guardOf(job), workerInstanceId: WORKER_B }),
    );

    expect(result).toEqual({ outcome: 'STALE_JOB_LEASE' });

    const row = await readOutboxRow(context.disposable, job.outboxEventId);
    expect(row.status).toBe('PENDING');
    expect(row.claimedBy).toBe(WORKER_A);
    // A rejected completion writes no evidence: the attempt did not finish.
    expect(await readAttempts(context.disposable, job.outboxEventId)).toEqual([]);
  });

  it('case 17 — a completion for a stale attempt number is rejected', async () => {
    const job = await claimOne();

    const result = await context.inTransaction(() =>
      queue.completeSucceededAttempt({ ...guardOf(job), attemptNo: job.attemptNo - 1 }),
    );

    expect(result).toEqual({ outcome: 'STALE_JOB_LEASE' });
    expect(await readAttempts(context.disposable, job.outboxEventId)).toEqual([]);
    expect((await readOutboxRow(context.disposable, job.outboxEventId)).status).toBe('PENDING');
  });

  it('case 18 — payload and identity survive claim, retry and dead-letter unchanged', async () => {
    const job = await claimOne();
    const before = await readOutboxRow(context.disposable, job.outboxEventId);

    await context.inTransaction(() =>
      queue.completeRetryableAttempt({
        ...guardOf(job),
        retryDelayMs: -1_000,
        errorClass: 'JOB_TRANSIENT_FAILURE',
      }),
    );
    const [second] = await context.inTransaction(() =>
      queue.claimRegisteredBatch({
        workerInstanceId: WORKER_B,
        registeredTypes: REGISTERED,
        batchSize: 5,
        leaseDurationMs: LEASE_MS,
      }),
    );
    await context.inTransaction(() =>
      queue.completeTerminalAttempt({
        outboxEventId: job.outboxEventId,
        workerInstanceId: WORKER_B,
        attemptNo: second?.attemptNo ?? 0,
        jobKind: SYNTHETIC_JOB_KIND,
        errorClass: 'JOB_INVARIANT_VIOLATION',
      }),
    );

    const after = await readOutboxRow(context.disposable, job.outboxEventId);
    expect(after.payload).toEqual(PAYLOAD);
    expect(after.eventType).toBe(before.eventType);
    expect(after.aggregateId).toBe(before.aggregateId);
    expect(after.id).toBe(before.id);
  });

  it('case 22 — attempt uniqueness survives a replayed completion', async () => {
    const job = await claimOne();
    const guard = guardOf(job);

    const first = await context.inTransaction(() => queue.completeSucceededAttempt(guard));
    const replay = await context.inTransaction(() => queue.completeSucceededAttempt(guard));

    expect(first).toEqual({ outcome: 'COMPLETED' });
    // The guard already failed, so the second call never reaches the ledger —
    // the unique constraint is never even exercised.
    expect(replay).toEqual({ outcome: 'STALE_JOB_LEASE' });
    expect(await readAttempts(context.disposable, job.outboxEventId)).toHaveLength(1);
  });
});
