/**
 * Deterministic in-process coordination for DB8 concurrency tests.
 *
 * Two actors racing against real, independent PostgreSQL connections still
 * run inside the same Node process (their `await`s interleave on one event
 * loop). `Barrier` turns that into a deterministic interleaving — "actor A
 * does not proceed past this line until actor B has reached that line" —
 * instead of coordinating with `sleep`, which is exactly what §11/§29 forbid
 * ("no flaky retry loops", "deterministic synchronization barriers, not
 * sleep-only tests").
 *
 * Test-only.
 */

interface Gate {
  readonly promise: Promise<void>;
  resolve(): void;
}

function createGate(): Gate {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export class Barrier {
  private readonly gates = new Map<string, Gate>();

  private gateFor(name: string): Gate {
    let gate = this.gates.get(name);
    if (gate === undefined) {
      gate = createGate();
      this.gates.set(name, gate);
    }
    return gate;
  }

  /** Unblocks every current and future `waitFor(name)` caller. Idempotent. */
  signal(name: string): void {
    this.gateFor(name).resolve();
  }

  /**
   * Resolves once `signal(name)` has been called. If `signal` already ran,
   * resolves immediately — order of `signal`/`waitFor` calls does not matter,
   * only their relative timing does, which is the point.
   */
  async waitFor(name: string, timeoutMs = 10_000): Promise<void> {
    const gate = this.gateFor(name);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(new Error(`Barrier timed out waiting for signal "${name}" after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    try {
      await Promise.race([gate.promise, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
