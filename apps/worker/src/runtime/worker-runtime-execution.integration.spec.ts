/**
 * APP2-I02 §17 cases 19, 20, 21 and 25 — a live worker against a real
 * PostgreSQL.
 *
 * The whole runtime runs here: the poll loop claims, the handler executes under
 * a real timeout, and the completion transactions commit against the real
 * constraints. Nothing is stubbed except the handlers themselves, which are
 * synthetic because I02 ships no production handler.
 */
import { IdempotencyStore, TransactionManager } from '@embroidery/persistence';

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

describe('worker runtime — execution (integration)', () => {
  let context: WorkerRuntimeContext | undefined;

  afterEach(async () => {
    await context?.close();
    context = undefined;
  });

  it('case 19 — a handler timeout writes safe retry evidence', async () => {
    context = await startWorkerRuntime({
      label: 'i02-timeout',
      handlers: [
        handler({
          // Never resolves and ignores its signal: the runtime must stop
          // waiting on its own rather than hang.
          execute: () => new Promise<void>(() => undefined),
        }),
      ],
    });
    const id = await seedDueEvent(context.disposable);

    await waitFor(
      async () => (await attemptsFor(context!.disposable, id)).length > 0,
      20_000,
      'the timeout attempt',
    );

    const [attempt] = await attemptsFor(context.disposable, id);
    expect(attempt?.outcome).toBe('FAILED_RETRYABLE');
    expect(attempt?.errorClass).toBe('JOB_HANDLER_TIMEOUT');

    const row = await outboxState(context.disposable, id);
    expect(row.lastError).toBe('JOB_HANDLER_TIMEOUT');
    // A class, never a message: the column is read by operators.
    expect(row.lastError).not.toContain(' ');
  });

  it('case 20 — an invalid payload is terminal and the handler is never called', async () => {
    let called = 0;
    context = await startWorkerRuntime({
      label: 'i02-invalid',
      handlers: [
        handler({
          validatePayload: () => ({ valid: false, errorClass: 'JOB_PAYLOAD_INVALID' }),
          execute: () => {
            called += 1;
            return Promise.resolve();
          },
        }),
      ],
    });
    const id = await seedDueEvent(context.disposable, { payload: { bad: true } });

    await waitFor(
      async () => (await outboxState(context!.disposable, id)).status === 'DEAD_LETTER',
      20_000,
      'the dead-letter row',
    );

    expect(called).toBe(0);
    const attempts = await attemptsFor(context.disposable, id);
    expect(attempts).toEqual([
      { attemptNo: 1, outcome: 'FAILED_TERMINAL', errorClass: 'JOB_PAYLOAD_INVALID' },
    ]);
  });

  it('case 21 — an unknown failure retries, then terminates at the attempt cap', async () => {
    let calls = 0;
    context = await startWorkerRuntime({
      label: 'i02-unknown',
      handlers: [
        handler({
          execute: () => {
            calls += 1;
            return Promise.reject(new Error('an unclassified failure'));
          },
        }),
      ],
    });
    const id = await seedDueEvent(context.disposable);

    await waitFor(
      async () => (await outboxState(context!.disposable, id)).status === 'DEAD_LETTER',
      30_000,
      'the exhausted retries',
    );

    expect(calls).toBe(FAST_POLICY.maxAttempts);
    expect(await attemptsFor(context.disposable, id)).toEqual([
      { attemptNo: 1, outcome: 'FAILED_RETRYABLE', errorClass: 'JOB_UNKNOWN_FAILURE' },
      { attemptNo: 2, outcome: 'FAILED_TERMINAL', errorClass: 'JOB_UNKNOWN_FAILURE' },
    ]);
    // The retry states were PENDING throughout; FAILED is never emitted.
    const finalState = await outboxState(context.disposable, id);
    expect(finalState.status).toBe('DEAD_LETTER');
    expect(finalState.claimedBy).toBeNull();
  });

  it('case 25 — a committed effect is not repeated when the attempt replays', async () => {
    // The handler commits a durable, idempotency-guarded effect and then fails,
    // which is the shape of a real crash between "effect done" and "completion
    // recorded". The replay must observe the effect and not repeat it.
    let effectWrites = 0;
    let replays = 0;
    let failNext = true;

    context = await startWorkerRuntime({
      label: 'i02-idempotent',
      handlers: [
        handler({
          execute: async (_payload, executionContext) => {
            const store = context!.get<IdempotencyStore>(IdempotencyStore);
            const transactions = context!.get<TransactionManager>(TransactionManager);

            const claim = await transactions.runInTransaction(() =>
              store.claim(
                {
                  namespace: 'app2.i02.synthetic',
                  scopeKey: executionContext.effectKey,
                  fingerprint: executionContext.effectKey,
                },
                new Date(Date.now() + 3_600_000),
              ),
            );

            if (claim.outcome === 'claimed') {
              effectWrites += 1;
            } else {
              replays += 1;
            }

            if (failNext) {
              // The effect has already committed; only the completion fails.
              failNext = false;
              throw new Error('crashed after the effect committed');
            }
          },
        }),
      ],
    });
    const id = await seedDueEvent(context.disposable);

    await waitFor(
      async () => (await outboxState(context!.disposable, id)).status === 'DISPATCHED',
      30_000,
      'the successful replay',
    );

    // Ran twice, but the durable effect was written exactly once.
    expect(effectWrites).toBe(1);
    expect(replays).toBeGreaterThanOrEqual(1);

    const attempts = await attemptsFor(context.disposable, id);
    expect(attempts.map((attempt) => attempt.outcome)).toEqual(['FAILED_RETRYABLE', 'SUCCEEDED']);
  });
});
