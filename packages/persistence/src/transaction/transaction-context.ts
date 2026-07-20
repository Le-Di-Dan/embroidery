/**
 * Carries the active transaction across `await` boundaries (DEC-DB7-006).
 *
 * `AsyncLocalStorage` is entered once per `TransactionManager.runInTransaction`
 * call, so two concurrently running tasks each get their own store and cannot
 * observe each other's transaction. That property is not assumed — it is
 * asserted by an explicit concurrency test.
 *
 * The store is module-private on purpose: only `TransactionManager` may enter
 * it, which is what keeps the transaction boundary explicit even though the
 * handle itself is ambient.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Transaction } from '@embroidery/database';

const storage = new AsyncLocalStorage<Transaction>();

export const transactionContext = {
  /** The transaction of the innermost enclosing boundary, or `undefined` outside one. */
  current(): Transaction | undefined {
    return storage.getStore();
  },

  /** Runs `work` with `transaction` as the ambient handle. Manager-only. */
  run<T>(transaction: Transaction, work: () => Promise<T>): Promise<T> {
    return storage.run(transaction, work);
  },

  /** True when the caller is inside an application transaction boundary. */
  isActive(): boolean {
    return storage.getStore() !== undefined;
  },
};
