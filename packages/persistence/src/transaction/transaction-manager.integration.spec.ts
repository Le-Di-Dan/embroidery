/**
 * DB7-CP1/CP2 — transaction semantics against a real PostgreSQL instance.
 *
 * `redirect_rules` (TBL-067) is the probe table: it is a real DB6 table with a
 * UNIQUE arbiter and a CHECK constraint, so commit, rollback and constraint
 * behaviour are observed through the same call path production code uses,
 * rather than through a scratch table with no constraints.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { newId, schema } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';
import { eq } from 'drizzle-orm';

import { DatabaseModule } from '../database.module';
import { DatabaseExecutor } from '../runtime/database-executor';
import { TransactionManager } from './transaction-manager';
import { transactionContext } from './transaction-context';

const { redirectRules } = schema;

describe('transaction manager (integration)', () => {
  let disposable: DisposableDatabase;
  let moduleRef: TestingModule;
  let manager: TransactionManager;
  let executor: DatabaseExecutor;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('cp1-transaction');
    previousUrl = process.env['DATABASE_URL'];
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';

    moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    await moduleRef.init();
    manager = moduleRef.get(TransactionManager);
    executor = moduleRef.get(DatabaseExecutor);
  });

  afterAll(async () => {
    await moduleRef?.close();
    if (previousUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousUrl;
    }
    await disposable?.drop();
  });

  afterEach(async () => {
    await executor.current().delete(redirectRules);
  });

  async function insertRule(sourcePath: string): Promise<string> {
    const id = newId();
    await executor.current().insert(redirectRules).values({
      id,
      sourcePath,
      targetPath: '/target',
      redirectKind: 'PERMANENT',
      isActive: true,
    });
    return id;
  }

  async function countRules(): Promise<number> {
    const rows = await executor.current().select().from(redirectRules);
    return rows.length;
  }

  describe('commit and rollback', () => {
    it('commits every write of a successful transaction', async () => {
      await manager.runInTransaction(async () => {
        await insertRule('/a');
        await insertRule('/b');
      });

      expect(await countRules()).toBe(2);
    });

    it('rolls back every write when the callback throws', async () => {
      await expect(
        manager.runInTransaction(async () => {
          await insertRule('/a');
          await insertRule('/b');
          throw new Error('use case failed after both writes');
        }),
      ).rejects.toThrow('use case failed after both writes');

      // Neither row survives: a partial commit here would be the multi-table
      // atomicity failure every DB7 command depends on not happening.
      expect(await countRules()).toBe(0);
    });

    it('rolls back when the database itself rejects the second write', async () => {
      await expect(
        manager.runInTransaction(async () => {
          await insertRule('/duplicate');
          await insertRule('/duplicate');
        }),
      ).rejects.toThrow();

      expect(await countRules()).toBe(0);
    });

    it('returns the callback result', async () => {
      const result = await manager.runInTransaction(async () => {
        await insertRule('/a');
        return 'done';
      });
      expect(result).toBe('done');
    });
  });

  describe('executor resolution', () => {
    it('uses the transaction handle inside a boundary and the pool outside it', async () => {
      const outside = executor.current();

      await manager.runInTransaction(() => {
        expect(executor.current()).not.toBe(outside);
        expect(transactionContext.isActive()).toBe(true);
      });

      expect(executor.current()).toBe(outside);
      expect(transactionContext.isActive()).toBe(false);
    });

    it('rejects a multi-table command invoked without a boundary', () => {
      expect(() =>
        executor.requireTransaction('OrderRepository.createFromAcceptedQuotation'),
      ).toThrow(/must run inside a transaction/);
    });

    it('accepts a multi-table command invoked inside a boundary', async () => {
      await manager.runInTransaction(() => {
        expect(
          executor.requireTransaction('OrderRepository.createFromAcceptedQuotation'),
        ).toBeDefined();
      });
    });
  });

  describe('nested behaviour', () => {
    it('joins the enclosing transaction by default — an inner failure rolls back the outer writes', async () => {
      await expect(
        manager.runInTransaction(async () => {
          await insertRule('/outer');
          await manager.runInTransaction(async () => {
            await insertRule('/inner');
            throw new Error('inner failed');
          });
        }),
      ).rejects.toThrow('inner failed');

      expect(await countRules()).toBe(0);
    });

    it('never opens a second independent transaction for a nested call', async () => {
      await manager.runInTransaction(async () => {
        const outerHandle = executor.current();
        await manager.runInTransaction(() => {
          expect(executor.current()).toBe(outerHandle);
        });
      });
    });

    it('isolates an inner failure when the caller asks for a savepoint', async () => {
      await manager.runInTransaction(async () => {
        await insertRule('/outer');

        await expect(
          manager.runInTransaction(
            async () => {
              await insertRule('/inner');
              throw new Error('inner failed');
            },
            { savepoint: true },
          ),
        ).rejects.toThrow('inner failed');

        // The savepoint rolled back; the outer transaction is still usable.
        await insertRule('/after-savepoint');
      });

      const rows = await executor.current().select().from(redirectRules);
      expect(rows.map((row) => row.sourcePath).sort()).toEqual(['/after-savepoint', '/outer']);
    });

    it('refuses to change the isolation level of an already-open transaction', async () => {
      await manager.runInTransaction(async () => {
        await expect(
          manager.runInTransaction(() => undefined, { isolationLevel: 'serializable' }),
        ).rejects.toThrow(/isolation level/);
      });
    });

    it('refuses to change the access mode of an already-open transaction', async () => {
      await manager.runInTransaction(async () => {
        await expect(manager.runInTransaction(() => undefined, { readOnly: true })).rejects.toThrow(
          /access mode/,
        );
      });
    });
  });

  describe('options', () => {
    it('honours a read-only transaction by refusing the write', async () => {
      await expect(
        manager.runInTransaction(() => insertRule('/read-only'), { readOnly: true }),
      ).rejects.toThrow();

      expect(await countRules()).toBe(0);
    });

    it('honours an explicit isolation level', async () => {
      const level = await manager.runInTransaction(
        async () => {
          const result = await executor
            .current()
            .execute<{ level: string }>("SELECT current_setting('transaction_isolation') AS level");
          return result.rows[0]?.level;
        },
        { isolationLevel: 'serializable' },
      );

      expect(level).toBe('serializable');
    });
  });

  describe('async isolation', () => {
    it('does not leak a transaction into a concurrently running task', async () => {
      let sawTransactionOutside: boolean | undefined;

      const inside = manager.runInTransaction(async () => {
        await insertRule('/inside');
        // Yield so the other task is guaranteed to run while this transaction
        // is open — otherwise the test could pass without ever interleaving.
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      const outside = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        sawTransactionOutside = transactionContext.isActive();
      })();

      await Promise.all([inside, outside]);

      expect(sawTransactionOutside).toBe(false);
    });

    it('gives two concurrent transactions independent handles and independent outcomes', async () => {
      const committed = manager.runInTransaction(async () => {
        await insertRule('/committed');
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      const rolledBack = manager
        .runInTransaction(async () => {
          await insertRule('/rolled-back');
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('second task failed');
        })
        .catch(() => undefined);

      await Promise.all([committed, rolledBack]);

      const rows = await executor.current().select().from(redirectRules);
      expect(rows.map((row) => row.sourcePath)).toEqual(['/committed']);
    });
  });

  describe('connection release', () => {
    it('releases the client after a rolled-back transaction', async () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await manager
          .runInTransaction(async () => {
            await insertRule('/churn');
            throw new Error('rollback');
          })
          .catch(() => undefined);
      }

      // A leaked client per rollback would exhaust the pool long before the
      // twelfth iteration and this query would hang rather than return.
      await expect(
        executor
          .current()
          .select()
          .from(redirectRules)
          .where(eq(redirectRules.sourcePath, '/churn')),
      ).resolves.toEqual([]);
    });
  });
});
