/**
 * APP2-I02 §17 cases 23, 24, 26 and 27 — concurrency, shutdown, readiness and
 * cleanup, with a live worker against a real PostgreSQL.
 */
import { executeRaw, sql } from '@embroidery/database';
import { WorkerJobQueueRepository } from '@embroidery/persistence';

import { JobPollRuntimeService } from './poll/job-poll-runtime.service';
import type { JobHandler } from './registry/job-handler';
import type { WorkerRuntimeContext } from './tests/worker-runtime-context';
import {
  FAST_POLICY,
  SYNTHETIC_EVENT_ALPHA,
  SYNTHETIC_EVENT_BETA,
  countByStatus,
  outboxState,
  seedDueEvent,
  startWorkerRuntime,
  waitFor,
} from './tests/worker-runtime-context';

function handler(overrides: Partial<JobHandler> = {}): JobHandler {
  return {
    eventType: SYNTHETIC_EVENT_ALPHA,
    jobKind: 'OUTBOX_DISPATCH',
    payloadSchemaVersion: 1,
    validatePayload: (payload) => ({ valid: true, payload }),
    deriveEffectKey: (_payload, id) => `i02-effect:${id.toString()}`,
    execute: () => Promise.resolve(),
    ...overrides,
  };
}

describe('worker runtime — lifecycle (integration)', () => {
  let context: WorkerRuntimeContext | undefined;

  afterEach(async () => {
    await context?.close();
    context = undefined;
  });

  it('case 23 — never exceeds the configured concurrency against a real queue', async () => {
    let live = 0;
    let peak = 0;

    context = await startWorkerRuntime({
      label: 'i02-concurrency',
      handlers: [
        handler({
          execute: async () => {
            live += 1;
            peak = Math.max(peak, live);
            await new Promise((resolve) => setTimeout(resolve, 60));
            live -= 1;
          },
        }),
      ],
    });

    for (let index = 0; index < 8; index += 1) {
      await seedDueEvent(context.disposable);
    }

    await waitFor(
      async () => (await countByStatus(context!.disposable, 'DISPATCHED')) === 8,
      30_000,
      'all eight jobs to finish',
    );

    expect(peak).toBeLessThanOrEqual(FAST_POLICY.concurrency);
    expect(peak).toBeGreaterThan(0);
  });

  it('case 24 — shutdown stops new claims and leaves later work untouched', async () => {
    context = await startWorkerRuntime({
      label: 'i02-shutdown',
      handlers: [handler()],
    });

    const first = await seedDueEvent(context.disposable);
    await waitFor(
      async () => (await outboxState(context!.disposable, first)).status === 'DISPATCHED',
      20_000,
      'the first job',
    );

    const runtime = context.get<JobPollRuntimeService>(JobPollRuntimeService);
    await runtime.onApplicationShutdown('SIGTERM');

    // Work that arrives after shutdown must never be claimed.
    const afterShutdown = await seedDueEvent(context.disposable);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const state = await outboxState(context.disposable, afterShutdown);
    expect(state.status).toBe('PENDING');
    expect(state.attemptCount).toBe(0);
    expect(state.claimedBy).toBeNull();

    expect(await runtime.readiness()).toEqual({ ready: false, reason: 'SHUTTING_DOWN' });
  });

  it('case 26 — readiness reflects the policy and a real database probe', async () => {
    context = await startWorkerRuntime({ label: 'i02-readiness', handlers: [handler()] });
    const runtime = context.get<JobPollRuntimeService>(JobPollRuntimeService);
    const queue = context.get<WorkerJobQueueRepository>(WorkerJobQueueRepository);

    expect(await queue.probeWorkerDatabase()).toBe(true);
    expect(await runtime.readiness()).toEqual({ ready: true, reason: 'ok' });
  });

  it('case 26b — an unconfigured worker stays up, unready, and claims nothing', async () => {
    context = await startWorkerRuntime({
      label: 'i02-nopolicy',
      handlers: [handler()],
      withPolicy: false,
    });
    const id = await seedDueEvent(context.disposable);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const runtime = context.get<JobPollRuntimeService>(JobPollRuntimeService);
    expect(await runtime.readiness()).toEqual({
      ready: false,
      reason: 'WORKER_POLICY_MISSING',
    });
    // Unready must mean "claims nothing", not "claims with a guessed policy".
    expect((await outboxState(context.disposable, id)).attemptCount).toBe(0);
  });

  it('case 2b — an unregistered event type is never touched by a live worker', async () => {
    context = await startWorkerRuntime({ label: 'i02-unregistered', handlers: [handler()] });

    const mine = await seedDueEvent(context.disposable);
    const foreign = await seedDueEvent(context.disposable, { eventType: SYNTHETIC_EVENT_BETA });

    await waitFor(
      async () => (await outboxState(context!.disposable, mine)).status === 'DISPATCHED',
      20_000,
      'the registered job',
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    const untouched = await outboxState(context.disposable, foreign);
    expect(untouched.status).toBe('PENDING');
    expect(untouched.attemptCount).toBe(0);
  });

  it('case 27 — the disposable database leaves no residue behind', async () => {
    const local = await startWorkerRuntime({ label: 'i02-residue', handlers: [handler()] });
    const name = local.disposable.name;
    expect(name).toContain('i02_residue');

    await seedDueEvent(local.disposable);
    await waitFor(
      async () => (await countByStatus(local.disposable, 'DISPATCHED')) === 1,
      20_000,
      'the job to finish',
    );

    await local.close();

    // Ask the server whether the database still exists rather than trusting the
    // teardown code that was supposed to drop it. The probe runs on its own
    // disposable database, so the check itself leaves nothing behind either.
    const probe = await startWorkerRuntime({ label: 'i02-residue-probe' });
    try {
      expect(await databaseExists(probe, name)).toBe(false);
      expect(await databaseExists(probe, probe.disposable.name)).toBe(true);
    } finally {
      await probe.close();
    }
  });
});

async function databaseExists(context: WorkerRuntimeContext, name: string): Promise<boolean> {
  const rows = await executeRaw(
    context.disposable.client.db,
    sql`SELECT 1 AS found FROM pg_database WHERE datname = ${name}`,
  );
  return rows.length > 0;
}
