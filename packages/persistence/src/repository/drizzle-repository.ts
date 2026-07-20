/**
 * The narrow mechanical base every Drizzle repository extends (DB7 §10.2).
 *
 * This is **not** a generic CRUD base: it exposes no `findAll`, `create`,
 * `update` or `delete`, knows nothing about tables, and carries no domain
 * vocabulary. It provides exactly three mechanics every repository needs and
 * none should re-implement:
 *
 *   - resolving the executor (ambient transaction, else the pool);
 *   - asserting a transaction for multi-table commands;
 *   - funnelling driver errors through the central mapper.
 *
 * Anything with domain meaning belongs in the concrete repository.
 */
import { withMappedErrors } from '@embroidery/database';
import type { Transaction } from '@embroidery/database';

import type { DatabaseExecutor, DatabaseExecutorHandle } from '../runtime/database-executor';

export abstract class DrizzleRepository {
  protected constructor(private readonly executor: DatabaseExecutor) {}

  /** The handle to issue statements against: the ambient transaction, or the pool. */
  protected get db(): DatabaseExecutorHandle {
    return this.executor.current();
  }

  /**
   * The pooled handle, ignoring any ambient transaction.
   *
   * Only for evidence that must survive the failure it describes. See
   * `DatabaseExecutor.outsideTransaction`; state the reason at the call site.
   */
  protected get dbOutsideTransaction(): DatabaseExecutorHandle {
    return this.executor.outsideTransaction();
  }

  /**
   * The ambient transaction, failing loudly if there is none.
   *
   * Multi-table commands call this so a caller who forgot the boundary gets a
   * clear error instead of a half-written aggregate.
   */
  protected requireTransaction(operation: string): Transaction {
    return this.executor.requireTransaction(this.label(operation));
  }

  /**
   * Runs a method body with error mapping applied.
   *
   * Every public method wraps its body in this, so a new method cannot forget
   * the mapping and leak a raw Postgres error to a caller.
   */
  protected run<T>(operation: string, work: () => Promise<T>): Promise<T> {
    return withMappedErrors(this.label(operation), work);
  }

  private label(operation: string): string {
    return `${this.constructor.name}.${operation}`;
  }
}
