/**
 * The single accessor every repository uses to reach the database.
 *
 * `current()` returns the ambient transaction when one is open and the pool
 * handle otherwise, so one repository method body serves both callers — no
 * `tx` parameter, no second call style, no possibility of a repository quietly
 * writing outside the transaction its use case opened.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Database, Transaction } from '@embroidery/database';

import { DATABASE_CONNECTION } from './database.tokens';
import type { DatabaseConnection } from './database-connection';
import { transactionContext } from '../transaction/transaction-context';

/** Anything a repository can issue statements against. Infrastructure-only. */
export type DatabaseExecutorHandle = Database | Transaction;

@Injectable()
export class DatabaseExecutor {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  current(): DatabaseExecutorHandle {
    return transactionContext.current() ?? this.connection.database;
  }

  /**
   * For multi-table commands, whose atomicity is a correctness requirement
   * rather than a preference. Failing loudly here beats discovering at 3am
   * that half a command committed because a caller forgot the boundary.
   */
  requireTransaction(operation: string): Transaction {
    const transaction = transactionContext.current();
    if (transaction === undefined) {
      throw new Error(
        `${operation} must run inside a transaction: wrap the call in TransactionManager.runInTransaction.`,
      );
    }
    return transaction;
  }
}
