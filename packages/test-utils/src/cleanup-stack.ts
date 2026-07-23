/**
 * LIFO cleanup stack for integration contexts.
 *
 * Test contexts acquire resources in order (disposable database, then the
 * application, then an HTTP agent) and must release them in reverse, running
 * every step even if an earlier one throws — otherwise a failed
 * `app.close()` would leak the database it was meant to precede. This is the
 * one piece of teardown orchestration shared across packages; it owns no
 * database, framework or business behaviour.
 */

/** A single teardown action. May be sync or async. */
export type CleanupStep = () => void | Promise<void>;

export class CleanupStack {
  private readonly steps: { label: string; run: CleanupStep }[] = [];

  /** Register a teardown action. Actions run in reverse registration order. */
  push(label: string, run: CleanupStep): void {
    this.steps.push({ label, run });
  }

  /** Number of registered actions not yet run. */
  get size(): number {
    return this.steps.length;
  }

  /**
   * Run every registered action in reverse order, draining the stack. A step
   * that throws does not stop the rest; all failures are collected and thrown
   * together as an `AggregateError` so no resource is silently left behind.
   */
  async run(): Promise<void> {
    const failures: { label: string; error: unknown }[] = [];
    for (let step = this.steps.pop(); step !== undefined; step = this.steps.pop()) {
      try {
        await step.run();
      } catch (error: unknown) {
        failures.push({ label: step.label, error });
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.error),
        `Cleanup failed: ${failures.map((failure) => failure.label).join(', ')}`,
      );
    }
  }
}
