/**
 * The runtime's only source of time and delay (APP2-I02 §14).
 *
 * Injected so the poll loop and the handler timeout are testable without real
 * sleeps: a suite that had to wait a real `pollIntervalMs` would either be slow
 * or would shorten the interval until it stopped testing the real thing.
 *
 * This is *process* time — scheduling only. Every instant that matters for
 * correctness (due-ness, lease expiry, retry deadlines) comes from the database
 * inside the claim/completion statements, never from here.
 */

export interface WorkerClock {
  now(): number;
  /** Resolves after `ms`, or early when `signal` aborts. Never rejects. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** Schedules `onFire` and returns a cancel function. */
  timer(ms: number, onFire: () => void): () => void;
}

export const WORKER_CLOCK = Symbol('WORKER_CLOCK');

export const systemWorkerClock: WorkerClock = {
  now: () => Date.now(),

  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (signal?.aborted === true) {
        resolve();
        return;
      }
      const handle = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      // Deliberately not `unref`'d: the sleep is cancelled by the shutdown
      // signal, which is prompt and observable. Unreferencing it instead would
      // let the process exit mid-poll if nothing else held the loop open.

      function onAbort(): void {
        clearTimeout(handle);
        resolve();
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    }),

  timer: (ms, onFire) => {
    const handle = setTimeout(onFire, ms);
    return () => {
      clearTimeout(handle);
    };
  },
};
