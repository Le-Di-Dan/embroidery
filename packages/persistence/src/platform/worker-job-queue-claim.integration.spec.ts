/**
 * APP2-I02 §17 cases 1–9 — claim behaviour against a real PostgreSQL.
 *
 * Every case runs on a disposable database with all 32 migrations applied, so
 * the check constraints, the `background_job_attempts` uniqueness and the
 * CST-099 column-scoped outbox trigger are all live. Nothing here can pass by
 * agreeing with an in-memory fake.
 */
import type { PlatformTestContext } from '../testing/platform-test-context';
import { createPlatformTestContext } from '../testing/platform-test-context';
import { WorkerJobQueueRepository } from './worker-job-queue.repository';
import type { RegisteredJobType } from './worker-job-queue.types';
import {
  SYNTHETIC_EVENT_ALPHA,
  SYNTHETIC_EVENT_BETA,
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

describe('worker job queue — claim (integration)', () => {
  let context: PlatformTestContext;
  let queue: WorkerJobQueueRepository;

  beforeAll(async () => {
    context = await createPlatformTestContext('worker-queue-claim');
    queue = context.get(WorkerJobQueueRepository);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
  });

  const claim = (
    workerInstanceId: string,
    registeredTypes: readonly RegisteredJobType[] = REGISTERED,
    batchSize = 10,
  ) =>
    context.inTransaction(() =>
      queue.claimRegisteredBatch({
        workerInstanceId,
        registeredTypes,
        batchSize,
        leaseDurationMs: LEASE_MS,
      }),
    );

  it('case 1 — claims a fresh event whose type is registered', async () => {
    const id = await seedOutboxEvent(context.disposable, { nextAttemptOffsetSeconds: null });

    const claimed = await claim(WORKER_A);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.outboxEventId).toBe(id);
    expect(claimed[0]?.eventType).toBe(SYNTHETIC_EVENT_ALPHA);
    expect(claimed[0]?.attemptNo).toBe(1);
  });

  it('case 2 — leaves an unregistered event type completely untouched', async () => {
    const registeredId = await seedOutboxEvent(context.disposable, {
      nextAttemptOffsetSeconds: null,
    });
    const foreignId = await seedOutboxEvent(context.disposable, {
      eventType: SYNTHETIC_EVENT_BETA,
      nextAttemptOffsetSeconds: null,
    });

    const claimed = await claim(WORKER_A);

    expect(claimed.map((job) => job.outboxEventId)).toEqual([registeredId]);

    // Untouched means untouched: not just unclaimed, but unchanged.
    const foreign = await readOutboxRow(context.disposable, foreignId);
    expect(foreign.status).toBe('PENDING');
    expect(foreign.attemptCount).toBe(0);
    expect(foreign.claimedBy).toBeNull();
    expect(foreign.claimedAt).toBeNull();
  });

  it('case 3 — an empty registry claims nothing and cannot claim everything', async () => {
    const alphaId = await seedOutboxEvent(context.disposable, { nextAttemptOffsetSeconds: null });
    const betaId = await seedOutboxEvent(context.disposable, {
      eventType: SYNTHETIC_EVENT_BETA,
      nextAttemptOffsetSeconds: null,
    });

    const claimed = await claim(WORKER_A, []);

    expect(claimed).toEqual([]);

    // The registry is the whole filter, so prove the queue is genuinely intact
    // rather than merely that the call returned an empty array — an empty
    // registry that fell through to `IN ()` would be a claim-all.
    for (const id of [alphaId, betaId]) {
      const row = await readOutboxRow(context.disposable, id);
      expect(row.attemptCount).toBe(0);
      expect(row.claimedBy).toBeNull();
      expect(row.status).toBe('PENDING');
    }
  });

  it('case 4 — two workers never share an active lease on one event', async () => {
    await seedOutboxEvent(context.disposable, { nextAttemptOffsetSeconds: null });

    const [first, second] = await Promise.all([claim(WORKER_A), claim(WORKER_B)]);

    const owners = [...first, ...second];
    expect(owners).toHaveLength(1);
  });

  it('case 5 — writes owner, claim time, attempt number and deadline atomically', async () => {
    const id = await seedOutboxEvent(context.disposable, { nextAttemptOffsetSeconds: null });

    const [job] = await claim(WORKER_A);
    const row = await readOutboxRow(context.disposable, id);

    expect(job).toBeDefined();
    expect(row.status).toBe('PENDING');
    expect(row.claimedBy).toBe(WORKER_A);
    expect(row.attemptCount).toBe(1);
    expect(row.claimedAt).not.toBeNull();
    expect(row.nextAttemptAt).not.toBeNull();
    // The lease deadline is `now() + leaseDuration`, measured by the database.
    const leaseMs = (row.nextAttemptAt?.getTime() ?? 0) - (row.claimedAt?.getTime() ?? 0);
    expect(leaseMs).toBe(LEASE_MS);
    expect(job?.leaseExpiresAt.getTime()).toBe(row.nextAttemptAt?.getTime());
  });

  it('case 6 — an active lease blocks an early re-claim', async () => {
    await seedOutboxEvent(context.disposable, { nextAttemptOffsetSeconds: null });

    await claim(WORKER_A);
    const second = await claim(WORKER_B);

    expect(second).toEqual([]);
  });

  it('case 7 — an expired lease records the abandoned attempt exactly once', async () => {
    const id = await seedOutboxEvent(context.disposable, {
      attemptCount: 1,
      claimedBy: WORKER_A,
      nextAttemptOffsetSeconds: -5,
    });

    const reclaimed = await claim(WORKER_B);

    expect(reclaimed.map((job) => job.outboxEventId)).toEqual([id]);

    const attempts = await readAttempts(context.disposable, id);
    expect(attempts).toEqual([
      {
        jobKind: SYNTHETIC_JOB_KIND,
        jobKey: id.toString(),
        attemptNo: 1,
        outcome: 'FAILED_RETRYABLE',
        isDeadLetter: false,
        errorClass: 'WORKER_LEASE_EXPIRED',
      },
    ]);
  });

  it('case 8 — concurrent reclaimers still produce one abandoned-attempt row', async () => {
    const id = await seedOutboxEvent(context.disposable, {
      attemptCount: 1,
      claimedBy: WORKER_A,
      nextAttemptOffsetSeconds: -5,
    });

    const results = await Promise.all([
      claim('worker:test-c:3:cccc'),
      claim('worker:test-d:4:dddd'),
      claim('worker:test-e:5:eeee'),
    ]);

    // `FOR UPDATE SKIP LOCKED` gives the row to exactly one reclaimer; the
    // attempt-uniqueness constraint is the second line of defence, not the
    // first.
    expect(results.flat()).toHaveLength(1);

    const attempts = await readAttempts(context.disposable, id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.errorClass).toBe('WORKER_LEASE_EXPIRED');
  });

  it('case 9 — a re-claim advances the attempt number', async () => {
    const id = await seedOutboxEvent(context.disposable, {
      attemptCount: 2,
      claimedBy: WORKER_A,
      nextAttemptOffsetSeconds: -1,
    });

    const [job] = await claim(WORKER_B);
    const row = await readOutboxRow(context.disposable, id);

    expect(job?.attemptNo).toBe(3);
    expect(row.attemptCount).toBe(3);
    expect(row.claimedBy).toBe(WORKER_B);
  });
});
