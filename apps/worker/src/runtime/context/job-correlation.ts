/**
 * Per-attempt correlation context (APP2-I02 §13, FU-A07).
 *
 * `AsyncLocalStorage` rather than a parameter threaded through every call: the
 * context has to be readable from payload validation, effect-key derivation,
 * handler execution and completion logging, and a worker executes several
 * attempts concurrently. A module-level variable would interleave; a parameter
 * would have to cross the handler boundary, which would let a handler forge it.
 *
 * Deliberately **not** an HTTP request context. The worker never fabricates an
 * `X-Request-ID`: no HTTP request caused this work, and inventing one would put
 * a fake identifier into logs an operator correlates against real requests.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface JobCorrelationContext {
  readonly correlationId: string;
  readonly outboxEventId: bigint;
  readonly attemptNo: number;
  readonly workerInstanceId: string;
  readonly eventType: string;
  readonly jobKind: string;
}

const storage = new AsyncLocalStorage<JobCorrelationContext>();

export const jobCorrelation = {
  /** Runs `work` with `context` bound for its whole async subtree. */
  run<T>(context: JobCorrelationContext, work: () => T): T {
    return storage.run(context, work);
  },

  /** The active context, or undefined outside any attempt. */
  current(): JobCorrelationContext | undefined {
    return storage.getStore();
  },
};
