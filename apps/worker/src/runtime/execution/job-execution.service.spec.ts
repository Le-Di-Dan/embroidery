import type { TransactionManager, WorkerJobQueueRepository } from '@embroidery/persistence';

import { jobCorrelation } from '../context/job-correlation';
import { WorkerJobError } from '../errors/worker-job-error';
import { JobHandlerRegistry } from '../registry/job-handler.registry';
import { systemWorkerClock } from '../clock/worker-clock';
import {
  FakeQueue,
  FakeTransactions,
  TEST_POLICY,
  claimedJob,
  testHandler,
} from '../tests/runtime-doubles';
import { JobExecutionService } from './job-execution.service';

const WORKER_ID = 'worker:test:1:uuid';

function serviceWith(registry: JobHandlerRegistry, queue: FakeQueue): JobExecutionService {
  return new JobExecutionService(
    registry,
    queue as unknown as WorkerJobQueueRepository,
    new FakeTransactions() as unknown as TransactionManager,
    systemWorkerClock,
  );
}

describe('job execution', () => {
  let registry: JobHandlerRegistry;
  let queue: FakeQueue;

  beforeEach(() => {
    registry = new JobHandlerRegistry();
    queue = new FakeQueue();
  });

  it('runs the handler and records success', async () => {
    const handler = testHandler();
    registry.register(handler);

    const job = claimedJob();
    const summary = await serviceWith(registry, queue).run(job, TEST_POLICY, WORKER_ID);

    expect(summary.outcome).toBe('SUCCEEDED');
    expect(handler.calls).toBe(1);
    expect(queue.completions).toEqual([
      {
        kind: 'SUCCEEDED',
        guard: {
          outboxEventId: job.outboxEventId,
          workerInstanceId: WORKER_ID,
          attemptNo: 1,
          jobKind: 'OUTBOX_DISPATCH',
        },
      },
    ]);
  });

  it('binds the correlation context for the whole attempt', async () => {
    let seen: string | undefined;
    const handler = testHandler({
      execute: () => {
        seen = jobCorrelation.current()?.correlationId;
        return Promise.resolve();
      },
    });
    registry.register(handler);

    const job = claimedJob({ attemptNo: 4 });
    await serviceWith(registry, queue).run(job, TEST_POLICY, WORKER_ID);

    expect(seen).toBe(`OUTBOX_DISPATCH:${job.outboxEventId.toString()}:4`);
    expect(jobCorrelation.current()).toBeUndefined();
  });

  it('rejects an invalid payload as terminal without calling the handler', async () => {
    const handler = testHandler({
      validate: () => ({ valid: false, errorClass: 'JOB_PAYLOAD_INVALID' }),
    });
    registry.register(handler);

    const summary = await serviceWith(registry, queue).run(claimedJob(), TEST_POLICY, WORKER_ID);

    expect(summary.outcome).toBe('FAILED_TERMINAL');
    expect(summary.errorClass).toBe('JOB_PAYLOAD_INVALID');
    expect(handler.calls).toBe(0);
    expect(queue.completions[0]?.kind).toBe('TERMINAL');
  });

  it('treats a schema-version mismatch as terminal before validation runs', async () => {
    const handler = testHandler({ payloadSchemaVersion: 2 });
    registry.register(handler);

    const summary = await serviceWith(registry, queue).run(
      claimedJob({ payloadSchemaVersion: 1 }),
      TEST_POLICY,
      WORKER_ID,
    );

    expect(summary.errorClass).toBe('JOB_SCHEMA_UNSUPPORTED');
    expect(handler.calls).toBe(0);
  });

  it.each([
    ['an empty effect key', ''],
    ['an unbounded effect key', 'x'.repeat(201)],
  ])('refuses to run a handler that produces %s', async (_label, effectKey) => {
    const handler = testHandler({ effectKey });
    registry.register(handler);

    const summary = await serviceWith(registry, queue).run(claimedJob(), TEST_POLICY, WORKER_ID);

    // Without a usable effect key the handler cannot deduplicate its own
    // durable effect, so running it would break at-most-once for the effect.
    expect(summary.errorClass).toBe('JOB_INVARIANT_VIOLATION');
    expect(handler.calls).toBe(0);
  });

  it('passes an abort signal that fires at the handler timeout', async () => {
    let aborted = false;
    const handler = testHandler({
      execute: (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        }),
    });
    registry.register(handler);

    const summary = await serviceWith(registry, queue).run(
      claimedJob(),
      { ...TEST_POLICY, handlerTimeoutMs: 20 },
      WORKER_ID,
    );

    expect(aborted).toBe(true);
    expect(summary.errorClass).toBe('JOB_HANDLER_TIMEOUT');
    expect(summary.outcome).toBe('FAILED_RETRYABLE');
  });

  it('does not wait for a handler that ignores its abort signal', async () => {
    let settle: (() => void) | undefined;
    const handler = testHandler({
      execute: () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    });
    registry.register(handler);

    const summary = await serviceWith(registry, queue).run(
      claimedJob(),
      { ...TEST_POLICY, handlerTimeoutMs: 20 },
      WORKER_ID,
    );

    // The attempt is abandoned, not killed — Node cannot kill it — so the
    // runtime stops waiting on its own rather than hanging forever.
    expect(summary.errorClass).toBe('JOB_HANDLER_TIMEOUT');
    settle?.();
  });

  it('retries a transient failure below the attempt cap with the exact backoff', async () => {
    registry.register(
      testHandler({
        execute: () => Promise.reject(new WorkerJobError('JOB_TRANSIENT_FAILURE', 'temporary')),
      }),
    );

    await serviceWith(registry, queue).run(claimedJob({ attemptNo: 2 }), TEST_POLICY, WORKER_ID);

    const [completion] = queue.completions;
    expect(completion?.kind).toBe('RETRYABLE');
    expect(completion?.kind === 'RETRYABLE' && completion.input.retryDelayMs).toBe(200);
    expect(completion?.kind === 'RETRYABLE' && completion.input.errorClass).toBe(
      'JOB_TRANSIENT_FAILURE',
    );
  });

  it('dead-letters an unknown failure once the attempt cap is reached', async () => {
    registry.register(testHandler({ execute: () => Promise.reject(new Error('mystery')) }));

    const summary = await serviceWith(registry, queue).run(
      claimedJob({ attemptNo: TEST_POLICY.maxAttempts }),
      TEST_POLICY,
      WORKER_ID,
    );

    expect(summary.outcome).toBe('FAILED_TERMINAL');
    expect(summary.errorClass).toBe('JOB_UNKNOWN_FAILURE');
  });

  it('never persists a raw handler message', async () => {
    registry.register(
      testHandler({ execute: () => Promise.reject(new Error('password=hunter2 at /srv/x.ts:1')) }),
    );

    await serviceWith(registry, queue).run(claimedJob(), TEST_POLICY, WORKER_ID);

    const serialised = JSON.stringify(queue.completions, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('/srv/x.ts');
  });

  it('reports a stale lease instead of mutating a second time', async () => {
    registry.register(testHandler());
    queue.nextCompletion = { outcome: 'STALE_JOB_LEASE' };

    const summary = await serviceWith(registry, queue).run(claimedJob(), TEST_POLICY, WORKER_ID);

    expect(summary.stale).toBe(true);
    expect(queue.completions).toHaveLength(1);
  });

  it('abandons a claimed event that has no handler rather than dead-lettering it', async () => {
    const summary = await serviceWith(registry, queue).run(claimedJob(), TEST_POLICY, WORKER_ID);

    expect(summary.outcome).toBe('ABANDONED');
    expect(queue.completions).toEqual([]);
  });
});
