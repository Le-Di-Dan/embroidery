/**
 * Shared setup for the API module persistence suites (DB7-CP3).
 *
 * Each suite gets its own disposable database, a compiled Nest context with the
 * module under test, and a truncate between tests. Factored out because
 * repeating ~40 lines of environment juggling in every module suite is how the
 * setups drift apart and start proving slightly different things.
 *
 * Test-only.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import type { ModuleMetadata } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';

export interface PersistenceTestContext {
  readonly moduleRef: TestingModule;
  readonly disposable: DisposableDatabase;
  /** Opens a transaction, exactly as a use case would. */
  inTransaction<T>(work: () => T | Promise<T>): Promise<T>;
  /** Empties every table. Call between tests. */
  reset(): Promise<void>;
  get<T>(token: unknown): T;
  close(): Promise<void>;
}

/**
 * Provisions a database and compiles `imports` against it.
 *
 * `DATABASE_URL` is set before compiling because `DatabaseModule` reads the
 * environment at provider-construction time, and restored on close so suites
 * running in the same worker cannot leak configuration into one another.
 */
export async function createPersistenceTestContext(
  label: string,
  imports: NonNullable<ModuleMetadata['imports']>,
  /**
   * Optional provider overrides, applied before `compile()`.
   *
   * Added by `APP4-B03`, whose suites replace a clock and a code minter so a
   * ten-minute expiry and a fifteen-minute rate window are provable without
   * waiting either out. Optional and applied only when supplied, so every
   * existing suite compiles the same graph it always did.
   */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<PersistenceTestContext> {
  const disposable = await createDisposableDatabase(label);
  const previousUrl = process.env['DATABASE_URL'];
  const previousEnv = process.env['NODE_ENV'];

  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';

  let moduleRef: TestingModule;
  try {
    const builder = Test.createTestingModule({ imports });
    moduleRef = await (configure === undefined ? builder : configure(builder)).compile();
    await moduleRef.init();
  } catch (error: unknown) {
    // Never leave a database behind when compilation fails: the next run would
    // inherit it and the failure would look like a different problem.
    await disposable.drop();
    throw error;
  }

  const transactions = moduleRef.get(TransactionManager);

  return {
    moduleRef,
    disposable,
    inTransaction: (work) => transactions.runInTransaction(work),
    reset: () => truncateAllTables(disposable.client.db),
    get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
    close: async () => {
      await moduleRef.close();
      if (previousUrl === undefined) {
        delete process.env['DATABASE_URL'];
      } else {
        process.env['DATABASE_URL'] = previousUrl;
      }
      if (previousEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = previousEnv;
      }
      await disposable.drop();
    },
  };
}
