/**
 * The production API startup sequence (APP2-I03 §6).
 *
 * Extracted from `main.ts` so the ordering is testable rather than asserted in
 * prose: the API must verify its private object-storage buckets **before** it
 * accepts a single request, and must not listen at all when that fails.
 *
 * The order is explicit here rather than delegated to Nest lifecycle hooks.
 * Hook ordering between unrelated providers is not part of Nest's contract, and
 * "the bucket check happened to run before the port opened" is not a guarantee
 * anyone can rely on after the next module is added.
 */
export interface ApiStartupDependencies {
  /** Verifies (or creates) the private buckets. Throws on failure. */
  readonly bootstrapStorage: () => Promise<void>;
  /** Binds the port. Never called when `bootstrapStorage` rejects. */
  readonly listen: () => Promise<void>;
  /** Closes the application context and its pools exactly once. */
  readonly close: () => Promise<void>;
  readonly onError: (error: unknown) => void;
}

/**
 * Runs the sequence. Returns `true` when the API is listening.
 *
 * On failure the context is closed once and the caller fails the process; it
 * deliberately contains no retry loop. A bounded retry already exists inside
 * the AWS SDK, and a startup that spins forever is a process an orchestrator
 * cannot distinguish from a healthy one.
 */
export async function startApi(dependencies: ApiStartupDependencies): Promise<boolean> {
  try {
    await dependencies.bootstrapStorage();
  } catch (error: unknown) {
    dependencies.onError(error);
    // Closed here, not by the caller: the context owns a database pool, and a
    // process that fails startup while holding one never exits.
    await dependencies.close();
    return false;
  }

  await dependencies.listen();
  return true;
}
