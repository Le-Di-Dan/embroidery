/**
 * Transaction foundation (ADR-DB1-009, DB6-S03).
 *
 * DB6 provides the mechanism only. The *boundary* — which operations belong in
 * one transaction — is owned by application use cases in later checkpoints, so
 * nothing here starts a transaction implicitly.
 *
 * Verified by the DB6 spikes: commit/rollback, nested savepoints, configurable
 * isolation level, and row locks taken through the typed builder inside a
 * transaction.
 */
import type { PgTransaction, PgTransactionConfig } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';

import type { Database } from './create-database-client';
import type * as schema from '../schema/index';

export type Transaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Isolation levels used by this system.
 *
 * `read committed` is PostgreSQL's default and suits paths whose correctness
 * comes from row locks or unique constraints. `serializable` is for paths whose
 * correctness depends on a set of rows not changing underneath a decision; it
 * can abort with SQLSTATE 40001, which the caller must be prepared to retry.
 */
export type IsolationLevel = 'read committed' | 'repeatable read' | 'serializable';

export interface TransactionOptions {
  readonly isolationLevel?: IsolationLevel;
  readonly readOnly?: boolean;
}

/**
 * Runs `work` inside a transaction, committing on return and rolling back on
 * throw. A nested call opens a savepoint, so an inner failure can be caught
 * without discarding the outer transaction.
 */
export async function withTransaction<T>(
  executor: Database | Transaction,
  work: (tx: Transaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  // Built incrementally rather than with `undefined` values: the workspace
  // enables `exactOptionalPropertyTypes`, so an explicit `undefined` is not
  // the same as an absent property.
  const config: PgTransactionConfig = {};
  if (options.isolationLevel !== undefined) {
    config.isolationLevel = options.isolationLevel;
  }
  if (options.readOnly === true) {
    config.accessMode = 'read only';
  }

  return executor.transaction(async (tx) => work(tx), config);
}

/**
 * PostgreSQL SQLSTATEs the concurrency paths are expected to observe and
 * handle deliberately, rather than treat as unexpected failures.
 */
export const SQLSTATE = {
  /** unique_violation — an arbiter constraint rejected a duplicate. */
  UNIQUE_VIOLATION: '23505',
  /** foreign_key_violation */
  FOREIGN_KEY_VIOLATION: '23503',
  /** check_violation */
  CHECK_VIOLATION: '23514',
  /** lock_not_available — NOWAIT or lock_timeout fired. */
  LOCK_NOT_AVAILABLE: '55P03',
  /** serialization_failure — retry the whole transaction. */
  SERIALIZATION_FAILURE: '40001',
  /** deadlock_detected */
  DEADLOCK_DETECTED: '40P01',
  /** restrict_violation — raised by the immutability triggers. */
  RESTRICT_VIOLATION: '23001',
} as const;

export type SqlState = (typeof SQLSTATE)[keyof typeof SQLSTATE];

export function isSqlState(error: unknown, state: SqlState): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === state
  );
}
