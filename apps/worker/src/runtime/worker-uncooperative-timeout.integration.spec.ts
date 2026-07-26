/**
 * APP2-I02-C1 §10 — the uncooperative handler, against a real PostgreSQL.
 *
 * This is the suite that pins the corrected invariant:
 *
 *   A lease may be released after a timeout only once the timed-out handler has
 *   settled. An unsettled handler and a released queue row must never coexist.
 *
 * The handler here deliberately ignores its `AbortSignal` and never settles —
 * the exact case the original I02 implementation abandoned while releasing the
 * lease, which allowed a retry of the same job (same effect key) to run
 * alongside it.
 */
import { executeRaw, sql } from '@embroidery/database';

import { JobPollRuntimeService } from './poll/job-poll-runtime.service';
import { WorkerFatalService } from './lifecycle/worker-fatal.service';
import type { JobHandler } from './registry/job-handler';
import type { WorkerRuntimeContext } from './tests/worker-runtime-context';
import {
  SYNTHETIC_EVENT_ALPHA,
  attemptsFor,
  outboxState,
  seedDueEvent,
  startWorkerRuntime,
  waitFor,
} from './tests/worker-runtime-context';

/**
 * When each worker's handler began, in order.
 *
 * Overlap is proved by *ordering*, not by counting live promises. Both runtimes
 * share this Jest process, and the fatal exit is recorded by an injected seam
 * rather than performed — so the first worker's runaway promise is still
 * pending here, where in production its process would no longer exist. Counting
 * it as "live" would measure the harness, not the runtime. What the runtime
 * actually guarantees is that the second handler cannot start until the first
 * worker has been told to die, and that is what is asserted.
 */
const starts: { workerInstanceId: string; jobId: bigint; at: number }[] = [];

function trackStart(workerInstanceId: string, jobId: bigint): void {
  starts.push({ workerInstanceId, jobId, at: Date.now() });
}

function unresponsiveHandler(): JobHandler {
  return {
    eventType: SYNTHETIC_EVENT_ALPHA,
    jobKind: 'OUTBOX_DISPATCH',
    payloadSchemaVersion: 1,
    validatePayload: (payload) => ({ valid: true, payload }),
    deriveEffectKey: (_payload, id) => `i02c1-effect:${id.toString()}`,
    // Ignores the signal entirely and never settles.
    execute: (_payload, ctx) => {
      trackStart(ctx.workerInstanceId, ctx.outboxEventId);
      return new Promise<void>(() => undefined);
    },
  };
}

/** The second worker's handler: settles at once, so the reclaim can complete. */
function promptHandler(): JobHandler {
  return {
    ...unresponsiveHandler(),
    execute: (_payload, ctx) => {
      trackStart(ctx.workerInstanceId, ctx.outboxEventId);
      return Promise.resolve();
    },
  };
}

describe('worker runtime — uncooperative timeout (integration)', () => {
  let first: WorkerRuntimeContext | undefined;
  let second: WorkerRuntimeContext | undefined;

  beforeEach(() => {
    starts.length = 0;
  });

  afterEach(async () => {
    await second?.close();
    await first?.close();
    first = undefined;
    second = undefined;
  });

  it('keeps the lease, exits non-zero before expiry, and is reclaimed exactly once', async () => {
    first = await startWorkerRuntime({
      label: 'i02c1-unresponsive',
      handlers: [unresponsiveHandler()],
    });
    const runtime = first.get<JobPollRuntimeService>(JobPollRuntimeService);
    const fatal = first.get<WorkerFatalService>(WorkerFatalService);
    const firstWorkerId = runtime.workerInstanceId;

    const id = await seedDueEvent(first.disposable);

    // 1–3: claimed, timed out, handler still unsettled.
    await waitFor(
      async () => (await outboxState(first!.disposable, id)).claimedBy === firstWorkerId,
      20_000,
      'the first claim',
    );
    const claimed = await leaseRow(first, id);
    expect(claimed.attemptCount).toBe(1);

    // 7: the fatal exit is requested, and it happens before the lease expires.
    await waitFor(() => Promise.resolve(first!.exits.length > 0), 20_000, 'the fatal exit');
    const exitAt = Date.now();

    expect(first.exits).toEqual([1]);
    expect(fatal.runtimeState).toBe('FATAL_HANDLER_UNRESPONSIVE');
    expect(exitAt).toBeLessThan(claimed.leaseExpiresAt.getTime());
    // The hard-stop deadline is timeout + leaseSafetyMargin, well inside the
    // lease — this is the margin the correction exists to preserve.
    expect(claimed.leaseExpiresAt.getTime() - exitAt).toBeGreaterThan(1_000);

    // 4–5: no completion of any kind; the row is exactly as it was claimed.
    const held = await outboxState(first.disposable, id);
    expect(held.status).toBe('PENDING');
    expect(held.claimedBy).toBe(firstWorkerId);
    expect(held.attemptCount).toBe(1);
    expect(held.lastError).toBeNull();
    expect(await attemptsFor(first.disposable, id)).toEqual([]);
    expect((await leaseRow(first, id)).leaseExpiresAt.getTime()).toBe(
      claimed.leaseExpiresAt.getTime(),
    );

    // 6: readiness is false, and 8: no further claim is issued.
    expect(await runtime.readiness()).toEqual({
      ready: false,
      reason: 'FATAL_HANDLER_UNRESPONSIVE',
    });
    const secondEvent = await seedDueEvent(first.disposable);
    await delay(600);
    expect((await outboxState(first.disposable, secondEvent)).attemptCount).toBe(0);

    // 9: a second worker, after the lease expires. It shares the database but
    // is a separate runtime with its own instance id.
    await waitFor(
      () => Promise.resolve(Date.now() > claimed.leaseExpiresAt.getTime()),
      20_000,
      'the lease to expire',
    );
    second = await startWorkerRuntime({
      label: 'i02c1-reclaimer',
      handlers: [promptHandler()],
      existing: first.disposable,
    });
    const secondWorkerId =
      second.get<JobPollRuntimeService>(JobPollRuntimeService).workerInstanceId;
    expect(secondWorkerId).not.toBe(firstWorkerId);

    await waitFor(
      async () => (await outboxState(first!.disposable, id)).status === 'DISPATCHED',
      30_000,
      'the reclaimed job to finish',
    );

    // 10–11: exactly one lease-expiry attempt for the abandoned attempt number,
    // then the incremented attempt.
    expect(await attemptsFor(first.disposable, id)).toEqual([
      { attemptNo: 1, outcome: 'FAILED_RETRYABLE', errorClass: 'WORKER_LEASE_EXPIRED' },
      { attemptNo: 2, outcome: 'SUCCEEDED', errorClass: null },
    ]);

    // 12: no overlap. The job was executed exactly twice, once per worker, and
    // the second execution began only after the first worker had already been
    // told to exit — so in production the runaway handler's process is gone
    // before anything else can touch the row.
    const forThisJob = starts.filter((start) => start.jobId === id);
    expect(forThisJob.map((start) => start.workerInstanceId)).toEqual([
      firstWorkerId,
      secondWorkerId,
    ]);
    expect(forThisJob[1]?.at).toBeGreaterThan(exitAt);
  }, 180_000);
});

interface LeaseRow {
  readonly attemptCount: number;
  readonly leaseExpiresAt: Date;
}

/** Reads the lease deadline the database itself stamped on the row. */
async function leaseRow(context: WorkerRuntimeContext, id: bigint): Promise<LeaseRow> {
  const rows = await executeRaw<{ attempt_count: number; next_attempt_at: Date }>(
    context.disposable.client.db,
    sql`SELECT attempt_count, next_attempt_at FROM outbox_events WHERE id = ${id}`,
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error('The leased row disappeared.');
  }
  return {
    attemptCount: Number(row.attempt_count),
    leaseExpiresAt:
      row.next_attempt_at instanceof Date
        ? row.next_attempt_at
        : new Date(String(row.next_attempt_at)),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
