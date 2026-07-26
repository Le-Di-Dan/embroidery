import type { TransactionManager, WorkerJobQueueRepository } from '@embroidery/persistence';

import { type JobExecutionService } from '../execution/job-execution.service';
import { JobHandlerRegistry } from '../registry/job-handler.registry';
import { type WorkerPolicyService } from '../policy/worker-policy.service';
import type { WorkerRuntimePolicy } from '../policy/worker-runtime-policy';
import {
  FakeQueue,
  FakeTransactions,
  ImmediateClock,
  TEST_POLICY,
  claimedJob,
  testHandler,
} from '../tests/runtime-doubles';
import { JobPollRuntimeService } from './job-poll-runtime.service';

/** A policy service stubbed to a fixed answer; loading is covered separately. */
function policyService(policy: WorkerRuntimePolicy | undefined): WorkerPolicyService {
  return {
    load: () => Promise.resolve(),
    current: () => policy,
    currentProblem: () => (policy === undefined ? { kind: 'WORKER_POLICY_MISSING' } : undefined),
  } as unknown as WorkerPolicyService;
}

interface Harness {
  readonly runtime: JobPollRuntimeService;
  readonly queue: FakeQueue;
  readonly registry: JobHandlerRegistry;
  readonly clock: ImmediateClock;
  readonly started: number[];
  readonly finished: number[];
}

function harness(
  policy: WorkerRuntimePolicy | undefined,
  execute: (job: unknown) => Promise<void>,
): Harness {
  const queue = new FakeQueue();
  const registry = new JobHandlerRegistry();
  const clock = new ImmediateClock();
  const started: number[] = [];
  const finished: number[] = [];

  const execution = {
    run: async (job: unknown): Promise<unknown> => {
      started.push(started.length);
      await execute(job);
      finished.push(finished.length);
      return { outcome: 'SUCCEEDED', stale: false };
    },
  } as unknown as JobExecutionService;

  const runtime = new JobPollRuntimeService(
    registry,
    policyService(policy),
    queue as unknown as WorkerJobQueueRepository,
    new FakeTransactions() as unknown as TransactionManager,
    execution,
    clock,
  );

  return { runtime, queue, registry, clock, started, finished };
}

/** Lets the loop run a few turns without depending on real elapsed time. */
async function settle(turns = 40): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('job poll runtime', () => {
  it('issues no claim query at all while the registry is empty', async () => {
    const test = harness(TEST_POLICY, () => Promise.resolve());

    await test.runtime.onApplicationBootstrap();
    await settle();
    await test.runtime.onApplicationShutdown('TEST');

    expect(test.queue.claims).toEqual([]);
    // It sleeps instead of spinning — the loop must never busy-poll.
    expect(test.clock.sleeps.length).toBeGreaterThan(0);
  });

  it('claims nothing while the policy is missing, and reports why', async () => {
    const test = harness(undefined, () => Promise.resolve());
    test.registry.register(testHandler());

    await test.runtime.onApplicationBootstrap();
    await settle();
    const readiness = await test.runtime.readiness();
    await test.runtime.onApplicationShutdown('TEST');

    expect(test.queue.claims).toEqual([]);
    expect(readiness).toEqual({ ready: false, reason: 'WORKER_POLICY_MISSING' });
  });

  it('is ready with a valid policy, a live database and an empty registry', async () => {
    const test = harness(TEST_POLICY, () => Promise.resolve());

    await test.runtime.onApplicationBootstrap();
    const readiness = await test.runtime.readiness();
    await test.runtime.onApplicationShutdown('TEST');

    // Readiness must not depend on handlers, storage or any later checkpoint.
    expect(readiness).toEqual({ ready: true, reason: 'ok' });
  });

  it('reports not ready when the database probe fails', async () => {
    const test = harness(TEST_POLICY, () => Promise.resolve());
    test.queue.databaseReady = false;

    await test.runtime.onApplicationBootstrap();
    const readiness = await test.runtime.readiness();
    await test.runtime.onApplicationShutdown('TEST');

    expect(readiness).toEqual({ ready: false, reason: 'DATABASE_UNAVAILABLE' });
  });

  it('never runs more attempts at once than the configured concurrency', async () => {
    let peak = 0;
    let live = 0;
    const release: (() => void)[] = [];

    const test = harness(TEST_POLICY, () => {
      live += 1;
      peak = Math.max(peak, live);
      return new Promise<void>((resolve) => {
        release.push(() => {
          live -= 1;
          resolve();
        });
      });
    });
    test.registry.register(testHandler());
    // Far more work than slots, offered in one batch.
    test.queue.batches = [[claimedJob(), claimedJob(), claimedJob(), claimedJob()]];

    await test.runtime.onApplicationBootstrap();
    await settle(10);

    expect(peak).toBeLessThanOrEqual(TEST_POLICY.concurrency);
    expect(test.runtime.inFlightCount).toBeLessThanOrEqual(TEST_POLICY.concurrency);

    for (const resolve of release) {
      resolve();
    }
    await settle(5);
    await test.runtime.onApplicationShutdown('TEST');
  });

  it('never leases more jobs than it has free slots', async () => {
    const release: (() => void)[] = [];
    const test = harness(TEST_POLICY, () => new Promise<void>((r) => release.push(r)));
    test.registry.register(testHandler());
    test.queue.batches = [[claimedJob(), claimedJob()]];

    await test.runtime.onApplicationBootstrap();
    await settle(10);

    for (const claim of test.queue.claims) {
      expect(claim.batchSize).toBeLessThanOrEqual(TEST_POLICY.concurrency);
      expect(claim.batchSize).toBeLessThanOrEqual(TEST_POLICY.batchSize);
    }

    for (const resolve of release) {
      resolve();
    }
    await settle(5);
    await test.runtime.onApplicationShutdown('TEST');
  });

  it('stops claiming as soon as shutdown begins', async () => {
    const test = harness(TEST_POLICY, () => Promise.resolve());
    test.registry.register(testHandler());
    test.queue.batches = [[claimedJob()]];

    await test.runtime.onApplicationBootstrap();
    await settle(10);
    await test.runtime.onApplicationShutdown('SIGTERM');

    const claimsAtShutdown = test.queue.claims.length;
    await settle(20);

    expect(test.queue.claims).toHaveLength(claimsAtShutdown);
  });

  it('lets in-flight work finish normally within the grace period', async () => {
    let resolveJob: (() => void) | undefined;
    const test = harness(TEST_POLICY, () => new Promise<void>((r) => (resolveJob = r)));
    test.registry.register(testHandler());
    test.queue.batches = [[claimedJob()]];

    await test.runtime.onApplicationBootstrap();
    await settle(10);
    expect(test.runtime.inFlightCount).toBe(1);

    // Finishing during shutdown is allowed: the lease is still this worker's.
    const shutdown = test.runtime.onApplicationShutdown('SIGTERM');
    resolveJob?.();
    await shutdown;

    expect(test.finished).toHaveLength(1);
    expect(test.runtime.inFlightCount).toBe(0);
  });

  it('backs off after a claim failure instead of retrying tightly', async () => {
    const test = harness(TEST_POLICY, () => Promise.resolve());
    test.registry.register(testHandler());
    test.queue.claimError = new Error('connection terminated');

    await test.runtime.onApplicationBootstrap();
    await settle(10);
    await test.runtime.onApplicationShutdown('TEST');

    // Growing, capped delays — never a zero-delay reconnect loop.
    const delays = test.clock.sleeps;
    expect(delays.length).toBeGreaterThan(1);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(TEST_POLICY.backoffBaseMs);
    expect(Math.max(...delays)).toBeLessThanOrEqual(TEST_POLICY.backoffMaxMs);
  });

  it('survives an execution failure without stopping the loop', async () => {
    let calls = 0;
    const test = harness(TEST_POLICY, () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('runtime defect')) : Promise.resolve();
    });
    test.registry.register(testHandler());
    test.queue.batches = [[claimedJob()], [claimedJob()]];

    await test.runtime.onApplicationBootstrap();
    await settle(20);
    await test.runtime.onApplicationShutdown('TEST');

    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('mints one stable worker instance id for the process', async () => {
    const test = harness(TEST_POLICY, () => Promise.resolve());

    await test.runtime.onApplicationBootstrap();
    const first = test.runtime.workerInstanceId;
    await settle(5);
    await test.runtime.onApplicationShutdown('TEST');

    expect(first).toMatch(/^worker:[a-z0-9-]+:\d+:[0-9a-f-]{36}$/);
    expect(test.runtime.workerInstanceId).toBe(first);
  });
});
