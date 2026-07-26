/**
 * Doubles for the worker-runtime unit suites.
 *
 * Only the collaborators whose *real* behaviour is proven elsewhere are faked:
 * the queue seam and the transaction boundary are covered by the disposable-
 * PostgreSQL suites, so the unit tier can fake them and concentrate on
 * scheduling, timeouts, classification and lifecycle — the parts a database
 * cannot demonstrate.
 *
 * Build-excluded via `src/**` + `tests/**`.
 */
import type {
  ClaimRegisteredBatchInput,
  ClaimedWorkerJob,
  CompletionGuard,
  RetryableCompletionInput,
  TerminalCompletionInput,
  WorkerJobCompletion,
} from '@embroidery/persistence';

import type { WorkerClock } from '../clock/worker-clock';
import { WorkerFatalService } from '../lifecycle/worker-fatal.service';
import type { WorkerProcess } from '../lifecycle/worker-process';
import type { JobHandler, PayloadValidationResult } from '../registry/job-handler';
import type { WorkerRuntimePolicy } from '../policy/worker-runtime-policy';

export const TEST_POLICY: WorkerRuntimePolicy = {
  concurrency: 2,
  batchSize: 5,
  pollIntervalMs: 50,
  leaseDurationMs: 10_000,
  handlerTimeoutMs: 1_000,
  // Comfortably above the 250 ms fatal-exit reserve, so a cooperative handler
  // has real room to unwind after its abort.
  leaseSafetyMarginMs: 1_000,
  shutdownGraceMs: 500,
  maxAttempts: 3,
  backoffBaseMs: 100,
  backoffMaxMs: 5_000,
};

export type CompletionRecord =
  | { readonly kind: 'SUCCEEDED'; readonly guard: CompletionGuard }
  | { readonly kind: 'RETRYABLE'; readonly input: RetryableCompletionInput }
  | { readonly kind: 'TERMINAL'; readonly input: TerminalCompletionInput };

/** A queue that records what it was asked to do and returns scripted claims. */
export class FakeQueue {
  readonly claims: ClaimRegisteredBatchInput[] = [];
  readonly completions: CompletionRecord[] = [];
  batches: ClaimedWorkerJob[][] = [];
  nextCompletion: WorkerJobCompletion = { outcome: 'COMPLETED' };
  databaseReady = true;
  claimError: Error | undefined;

  claimRegisteredBatch(input: ClaimRegisteredBatchInput): Promise<ClaimedWorkerJob[]> {
    this.claims.push(input);
    if (this.claimError !== undefined) {
      return Promise.reject(this.claimError);
    }
    if (input.registeredTypes.length === 0) {
      return Promise.resolve([]);
    }
    // Honours `batchSize` exactly as the real `LIMIT` does. Returning more than
    // was asked for would let a suite "prove" a concurrency bound the runtime
    // does not actually have: a claimed job holds a lease, so the only correct
    // place to bound concurrency is the claim itself.
    const batch = this.batches.shift() ?? [];
    if (batch.length > input.batchSize) {
      this.batches.unshift(batch.slice(input.batchSize));
    }
    return Promise.resolve(batch.slice(0, input.batchSize));
  }

  completeSucceededAttempt(guard: CompletionGuard): Promise<WorkerJobCompletion> {
    this.completions.push({ kind: 'SUCCEEDED', guard });
    return Promise.resolve(this.nextCompletion);
  }

  completeRetryableAttempt(input: RetryableCompletionInput): Promise<WorkerJobCompletion> {
    this.completions.push({ kind: 'RETRYABLE', input });
    return Promise.resolve(this.nextCompletion);
  }

  completeTerminalAttempt(input: TerminalCompletionInput): Promise<WorkerJobCompletion> {
    this.completions.push({ kind: 'TERMINAL', input });
    return Promise.resolve(this.nextCompletion);
  }

  probeWorkerDatabase(): Promise<boolean> {
    return Promise.resolve(this.databaseReady);
  }
}

/** Runs the callback directly: transaction semantics are proven against a real database. */
export class FakeTransactions {
  runInTransaction<T>(work: () => T | Promise<T>): Promise<T> {
    return Promise.resolve(work());
  }
}

/**
 * Records exit codes instead of ending the Jest worker.
 *
 * The real `WorkerFatalService` is used against this seam rather than being
 * faked, so the tests exercise the actual idempotence, ordering and log
 * projection of the fatal path.
 */
export class FakeWorkerProcess implements WorkerProcess {
  readonly exits: number[] = [];

  exit(code: number): void {
    this.exits.push(code);
  }
}

/** A fatal service wired to a recording process seam and a recording closer. */
export function fatalServiceWith(process: FakeWorkerProcess): {
  fatal: WorkerFatalService;
  closes: number;
} {
  const state = { closes: 0 };
  const fatal = new WorkerFatalService(process);
  fatal.registerCloser(() => {
    state.closes += 1;
    return Promise.resolve();
  });
  return {
    fatal,
    get closes(): number {
      return state.closes;
    },
  };
}

/**
 * A clock whose sleeps resolve immediately but yield to the microtask queue.
 *
 * Immediate rather than manually advanced: the loop under test is driven by
 * scripted claim batches, so what the suite needs is for time not to be a real
 * wait, and a virtual timeline would add machinery without adding a assertion.
 */
export class ImmediateClock implements WorkerClock {
  readonly sleeps: number[] = [];

  /**
   * Real wall-clock milliseconds, not a counter.
   *
   * The hard-stop deadline is computed against `leaseExpiresAt`, a real
   * instant, so a monotonically-incrementing fake would make that arithmetic
   * meaningless. Only `sleep` is virtualised here.
   */
  now(): number {
    return Date.now();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    this.sleeps.push(ms);
    if (signal?.aborted === true) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }

  timer(ms: number, onFire: () => void): () => void {
    const handle = setTimeout(onFire, ms);
    return () => {
      clearTimeout(handle);
    };
  }
}

export interface TestHandlerOptions {
  readonly eventType?: string;
  readonly payloadSchemaVersion?: number;
  readonly validate?: (payload: unknown) => PayloadValidationResult<unknown>;
  readonly effectKey?: string;
  readonly execute?: (signal: AbortSignal) => Promise<void>;
}

export function testHandler(options: TestHandlerOptions = {}): JobHandler & { calls: number } {
  const handler = {
    eventType: options.eventType ?? 'app2.i02.synthetic.alpha',
    jobKind: 'OUTBOX_DISPATCH' as const,
    payloadSchemaVersion: options.payloadSchemaVersion ?? 1,
    calls: 0,
    validatePayload: (payload: unknown): PayloadValidationResult<unknown> =>
      options.validate === undefined ? { valid: true, payload } : options.validate(payload),
    deriveEffectKey: (_payload: unknown, id: bigint): string =>
      options.effectKey ?? `effect:${id.toString()}`,
    execute: async (_payload: unknown, _context: unknown, signal: AbortSignal): Promise<void> => {
      handler.calls += 1;
      if (options.execute !== undefined) {
        await options.execute(signal);
      }
    },
  };
  return handler;
}

let nextId = 1n;

export function claimedJob(overrides: Partial<ClaimedWorkerJob> = {}): ClaimedWorkerJob {
  nextId += 1n;
  return {
    outboxEventId: overrides.outboxEventId ?? nextId,
    eventType: overrides.eventType ?? 'app2.i02.synthetic.alpha',
    aggregateKind: 'CUSTOM_REQUEST',
    aggregateId: 'agg-1',
    payload: overrides.payload ?? { marker: 'i02' },
    payloadSchemaVersion: overrides.payloadSchemaVersion ?? 1,
    attemptNo: overrides.attemptNo ?? 1,
    claimedAt: new Date(),
    leaseExpiresAt: new Date(Date.now() + TEST_POLICY.leaseDurationMs),
  };
}
