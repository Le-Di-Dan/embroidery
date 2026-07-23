/**
 * LIFO teardown aggregator owned by the E2E orchestrator.
 *
 * The generic `@embroidery/test-utils` `CleanupStack` is JIT TypeScript source
 * (not runtime-loadable from plain Node per IMP-D018), and E2E teardown owns
 * broader concerns (host processes, containers, disposable database, port
 * verification) than generic test teardown. This is orchestration teardown, not
 * a second database lifecycle — the database lifecycle still comes from the
 * canonical `@embroidery/database/testing` harness.
 *
 * Guarantees: steps run in reverse registration order; one failing step never
 * skips the rest; every failure is aggregated and returned; running twice is a
 * no-op after the first pass.
 */
export class CleanupStack {
  #steps = [];
  #done = false;

  /** @param {string} name @param {() => (void | Promise<void>)} fn */
  push(name, fn) {
    this.#steps.push({ name, fn });
  }

  get size() {
    return this.#steps.length;
  }

  get done() {
    return this.#done;
  }

  /**
   * Runs every step in reverse order. Returns the list of failures (empty on
   * full success). Safe to call more than once — later calls are no-ops.
   * @param {{ logger?: (message: string) => void }} [options]
   * @returns {Promise<{ name: string, error: unknown }[]>}
   */
  async run({ logger } = {}) {
    if (this.#done) {
      return [];
    }
    this.#done = true;
    const failures = [];
    for (let i = this.#steps.length - 1; i >= 0; i -= 1) {
      const { name, fn } = this.#steps[i];
      try {
        await fn();
      } catch (error) {
        failures.push({ name, error });
        const message = error instanceof Error ? error.message : String(error);
        logger?.(`cleanup step "${name}" failed: ${message}`);
      }
    }
    return failures;
  }
}
