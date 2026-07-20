/**
 * Shared setup for the CTX-PLT platform suites (DB7-CP3).
 *
 * The platform stores are split across several suites by responsibility, so
 * this keeps their setup identical rather than letting four copies drift.
 *
 * Test-only.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import { sql } from 'drizzle-orm';

import { DatabaseModule } from '../database.module';
import { TransactionManager } from '../transaction/transaction-manager';

export interface PlatformTestContext {
  readonly moduleRef: TestingModule;
  readonly disposable: DisposableDatabase;
  inTransaction<T>(work: () => T | Promise<T>): Promise<T>;
  reset(): Promise<void>;
  /** Seeds the admin account policy versions need, returning its id. */
  seedAdmin(): Promise<string>;
  get<T>(token: unknown): T;
  close(): Promise<void>;
}

export async function createPlatformTestContext(label: string): Promise<PlatformTestContext> {
  const disposable = await createDisposableDatabase(label);
  const previousUrl = process.env['DATABASE_URL'];
  const previousEnv = process.env['NODE_ENV'];

  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';

  let moduleRef: TestingModule;
  try {
    moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    await moduleRef.init();
  } catch (error: unknown) {
    await disposable.drop();
    throw error;
  }

  const transactions = moduleRef.get(TransactionManager);

  return {
    moduleRef,
    disposable,
    inTransaction: (work) => transactions.runInTransaction(work),
    reset: () => truncateAllTables(disposable.client.db),
    seedAdmin: async () => {
      const id = newId();
      await disposable.client.db.execute(sql`
        insert into admin_accounts (id, email, display_name, status)
        values (${id}, ${`platform-${id}@example.com`}, 'Platform', 'ACTIVE')
      `);
      return id;
    },
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
