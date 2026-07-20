/**
 * Bounded transaction retry for DB8 races (§11).
 *
 * Retries the *whole* transaction body, never a partial statement, and only
 * when `mapDatabaseError` classified the failure `retryable: true`
 * (`RETRYABLE_TRANSACTION_FAILURE` — `40001`/`40P01`). Anything else — a
 * unique-arbiter rejection, a guard violation — rethrows immediately, so a
 * race test that expects a deterministic loser still sees that rejection
 * rather than it being silently retried into a false pass.
 *
 * Test-only. This is not a production retry policy — no such policy exists
 * in application code yet (§3 of `DB7_DB8_HANDOFF.md`); this harness exists
 * to prove the mapping is retryable-safe, not to ship a retry loop.
 */
import { isPersistenceError } from '@embroidery/database';

export interface RetryOutcome<T> {
  readonly value: T;
  /** 1 when the first attempt succeeded, 2+ when retries were needed. */
  readonly attempts: number;
  /** SQLSTATE of every retried (non-final) attempt, in order. */
  readonly retriedSqlStates: readonly (string | undefined)[];
}

export class RetryExhaustedError extends Error {
  constructor(
    readonly maxAttempts: number,
    override readonly cause: unknown,
  ) {
    super(`Exhausted ${maxAttempts} retry attempts against a retryable transaction failure`, {
      cause,
    });
    this.name = 'RetryExhaustedError';
  }
}

export async function withBoundedRetry<T>(
  work: () => Promise<T>,
  options: { readonly maxAttempts?: number } = {},
): Promise<RetryOutcome<T>> {
  const maxAttempts = options.maxAttempts ?? 3;
  const retriedSqlStates: (string | undefined)[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await work();
      return { value, attempts: attempt, retriedSqlStates };
    } catch (error: unknown) {
      const retryable = isPersistenceError(error) && error.retryable;
      if (!retryable || attempt === maxAttempts) {
        if (retryable) {
          throw new RetryExhaustedError(maxAttempts, error);
        }
        throw error;
      }
      retriedSqlStates.push(isPersistenceError(error) ? error.diagnostics.sqlState : undefined);
    }
  }
  /* istanbul ignore next -- unreachable: the loop always returns or throws */
  throw new Error('unreachable');
}
