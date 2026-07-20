/**
 * The only place an application transaction opens (DEC-DB7-006).
 *
 * Repositories never call this and never open a transaction themselves; use
 * cases do. The callback takes no arguments on purpose: handing a transaction
 * object to application code is exactly the leak rule §5.14 forbids, so the
 * handle travels through `transactionContext` instead and is resolved by
 * `DatabaseExecutor` inside infrastructure.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { IsolationLevel } from '@embroidery/database';
import { withTransaction } from '@embroidery/database';

import { DATABASE_CONNECTION } from '../runtime/database.tokens';
import type { DatabaseConnection } from '../runtime/database-connection';
import { transactionContext } from './transaction-context';

export interface TransactionRunOptions {
  readonly isolationLevel?: IsolationLevel;
  readonly readOnly?: boolean;
  /**
   * Inside an existing transaction, open a savepoint instead of joining, so an
   * inner failure can be caught without discarding the outer transaction.
   * Ignored at the outermost level, where a real transaction is opened anyway.
   */
  readonly savepoint?: boolean;
}

@Injectable()
export class TransactionManager {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  /**
   * Runs `work` inside a transaction: commit on return, roll back on throw.
   *
   * A nested call **joins** the enclosing transaction by default, so a use case
   * composed of other use cases cannot accidentally split its writes across two
   * independent transactions. `savepoint: true` opts into a savepoint instead.
   */
  async runInTransaction<T>(
    work: () => T | Promise<T>,
    options: TransactionRunOptions = {},
  ): Promise<T> {
    const active = transactionContext.current();
    // Normalised once: a use case whose body happens to be synchronous is still
    // a legitimate transaction (a guarded read, for instance).
    const run = (): Promise<T> => Promise.resolve(work());

    if (active !== undefined) {
      assertNoScopeChange(options);
      if (options.savepoint !== true) {
        return await run();
      }
      return await withTransaction(active, (savepoint) => transactionContext.run(savepoint, run));
    }

    return await withTransaction(
      this.connection.database,
      (transaction) => transactionContext.run(transaction, run),
      buildOptions(options),
    );
  }

  /** True when the caller already runs inside a transaction boundary. */
  isInTransaction(): boolean {
    return transactionContext.isActive();
  }
}

/**
 * Isolation level and access mode are properties of the *whole* transaction and
 * cannot be changed once it has started. Silently ignoring them would make a
 * caller believe it got `serializable` when it did not, so this is an error.
 */
function assertNoScopeChange(options: TransactionRunOptions): void {
  if (options.isolationLevel !== undefined) {
    throw new Error(
      'Cannot change the isolation level of an already-open transaction: ' +
        'request it at the outermost transaction boundary.',
    );
  }
  if (options.readOnly !== undefined) {
    throw new Error(
      'Cannot change the access mode of an already-open transaction: ' +
        'request it at the outermost transaction boundary.',
    );
  }
}

/** Built incrementally: the workspace enables `exactOptionalPropertyTypes`. */
function buildOptions(options: TransactionRunOptions): {
  isolationLevel?: IsolationLevel;
  readOnly?: boolean;
} {
  const result: { isolationLevel?: IsolationLevel; readOnly?: boolean } = {};
  if (options.isolationLevel !== undefined) {
    result.isolationLevel = options.isolationLevel;
  }
  if (options.readOnly !== undefined) {
    result.readOnly = options.readOnly;
  }
  return result;
}
