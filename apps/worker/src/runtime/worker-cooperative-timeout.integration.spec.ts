/**
 * APP2-I02-C1 §11 — the cooperative handler, against a real PostgreSQL.
 *
 * The counterpart to the uncooperative suite: a handler that observes its
 * `AbortSignal` and unwinds settles inside the hard-stop deadline, so the
 * runtime completes the attempt through the ordinary atomic transaction,
 * releases the lease and keeps polling. No fatal exit, no held lease.
 */
import { JobPollRuntimeService } from './poll/job-poll-runtime.service';
import type { JobHandler } from './registry/job-handler';
import type { WorkerRuntimeContext } from './tests/worker-runtime-context';
import {
  FAST_POLICY,
  SYNTHETIC_EVENT_ALPHA,
  attemptsFor,
  outboxState,
  seedDueEvent,
  startWorkerRuntime,
  waitFor,
} from './tests/worker-runtime-context';

interface SlowHandlerOptions {
  /** Resolve, reject, or resolve *after* the abort — the late-success case. */
  readonly onAbort?: 'resolve' | 'reject';
}

function cooperativeHandler(options: SlowHandlerOptions = {}): JobHandler & { runs: number } {
  const handler = {
    eventType: SYNTHETIC_EVENT_ALPHA,
    jobKind: 'OUTBOX_DISPATCH' as const,
    payloadSchemaVersion: 1,
    runs: 0,
    validatePayload: (payload: unknown) => ({ valid: true as const, payload }),
    deriveEffectKey: (_payload: unknown, id: bigint) => `i02c1-coop:${id.toString()}`,
    execute: (_payload: unknown, _ctx: unknown, signal: AbortSignal) => {
      handler.runs += 1;
      return new Promise<void>((resolve, reject) => {
        signal.addEventListener('abort', () => {
          if (options.onAbort === 'reject') {
            reject(new Error('unwound after abort'));
            return;
          }
          // Resolving here is a *late success*: the handler finished, but only
          // after the runtime had already given up on it.
          resolve();
        });
      });
    },
  };
  return handler;
}

describe('worker runtime — cooperative timeout (integration)', () => {
  let context: WorkerRuntimeContext | undefined;

  afterEach(async () => {
    await context?.close();
    context = undefined;
  });

  it('records JOB_HANDLER_TIMEOUT and a PENDING backoff, never SUCCEEDED', async () => {
    const handler = cooperativeHandler();
    context = await startWorkerRuntime({
      label: 'i02c1-coop',
      handlers: [handler],
      // A long first backoff so the retry cannot land while this test is still
      // reading the row it just asserted on. With the default 10 ms base, the
      // second attempt dead-lettered the event mid-assertion — a flaky test,
      // not a flaky runtime.
      policy: { ...FAST_POLICY, backoffBaseMs: 30_000, backoffMaxMs: 60_000 },
    });
    const id = await seedDueEvent(context.disposable);

    await waitFor(
      async () => (await attemptsFor(context!.disposable, id)).length > 0,
      20_000,
      'the first timeout attempt',
    );

    const [attempt] = await attemptsFor(context.disposable, id);
    // The handler resolved — but after its abort, so the attempt is a timeout.
    // Calling it SUCCEEDED would hide a handler that routinely overruns.
    expect(attempt).toEqual({
      attemptNo: 1,
      outcome: 'FAILED_RETRYABLE',
      errorClass: 'JOB_HANDLER_TIMEOUT',
    });

    const row = await outboxState(context.disposable, id);
    expect(row.status).toBe('PENDING');
    expect(row.lastError).toBe('JOB_HANDLER_TIMEOUT');
    // The lease was released: a settled handler cannot overlap a retry.
    expect(row.claimedBy).toBeNull();

    // No fatal exit, and the runtime is still healthy and polling.
    expect(context.exits).toEqual([]);
    const runtime = context.get<JobPollRuntimeService>(JobPollRuntimeService);
    expect(await runtime.readiness()).toEqual({ ready: true, reason: 'ok' });
  }, 120_000);

  it('dead-letters a repeatedly timing-out handler at maxAttempts', async () => {
    const handler = cooperativeHandler({ onAbort: 'reject' });
    context = await startWorkerRuntime({ label: 'i02c1-coop-max', handlers: [handler] });
    const id = await seedDueEvent(context.disposable);

    await waitFor(
      async () => (await outboxState(context!.disposable, id)).status === 'DEAD_LETTER',
      60_000,
      'the attempt cap',
    );

    expect(await attemptsFor(context.disposable, id)).toEqual([
      { attemptNo: 1, outcome: 'FAILED_RETRYABLE', errorClass: 'JOB_HANDLER_TIMEOUT' },
      { attemptNo: 2, outcome: 'FAILED_TERMINAL', errorClass: 'JOB_HANDLER_TIMEOUT' },
    ]);
    expect(handler.runs).toBe(FAST_POLICY.maxAttempts);

    const row = await outboxState(context.disposable, id);
    expect(row.claimedBy).toBeNull();
    expect(context.exits).toEqual([]);
    // The process stayed healthy throughout: a cooperative handler never
    // reaches the fatal path, however often it times out.
    const runtime = context.get<JobPollRuntimeService>(JobPollRuntimeService);
    expect(await runtime.readiness()).toEqual({ ready: true, reason: 'ok' });
  }, 120_000);
});
