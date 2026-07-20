/**
 * Multi-actor concurrency harness for DB8 (DB8-CP1).
 *
 * `createPersistenceTestContext` (DB7) compiles exactly one Nest module —
 * one connection pool — against a disposable database. A race needs at
 * least two *independent physical connections* holding open transactions at
 * the same time (§11 rule 10), so this spawns additional, separately
 * compiled module instances against the **same** disposable database
 * instead of creating a second database. Each spawned actor owns its own
 * pool, so two actors' transactions genuinely run on separate PostgreSQL
 * backends and can block/deadlock/serialize against each other for real —
 * not simulated with one connection or `Promise.all` without a barrier.
 *
 * Test-only.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { ModuleMetadata } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';
import type { TransactionRunOptions } from '@embroidery/persistence';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import type { sql } from 'drizzle-orm';

export interface ConcurrencyActor {
  readonly label: string;
  get<T>(token: unknown): T;
  inTransaction<T>(work: () => T | Promise<T>, options?: TransactionRunOptions): Promise<T>;
  /** Raw row snapshot, bypassing the actor's own transaction — for before/after assertions. */
  snapshot<T extends Record<string, unknown> = Record<string, unknown>>(
    query: ReturnType<typeof sql>,
  ): Promise<T[]>;
  close(): Promise<void>;
}

export interface ConcurrencyTestContext {
  readonly disposable: DisposableDatabase;
  spawnActor(label: string): Promise<ConcurrencyActor>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Swaps `DATABASE_URL`/`NODE_ENV` in, compiles, then restores immediately —
 * mirrors `persistence-test-context.ts`'s single-actor pattern, called once
 * per actor instead of once per context. Calls are never concurrent with
 * each other (each `await`s fully before the next), so there is no window
 * where two actors could read each other's environment override.
 */
async function compileActor(
  label: string,
  databaseUrl: string,
  imports: NonNullable<ModuleMetadata['imports']>,
): Promise<{ moduleRef: TestingModule; transactions: TransactionManager }> {
  const previousUrl = process.env['DATABASE_URL'];
  const previousEnv = process.env['NODE_ENV'];
  process.env['DATABASE_URL'] = databaseUrl;
  process.env['NODE_ENV'] = 'test';

  try {
    const moduleRef = await Test.createTestingModule({ imports }).compile();
    await moduleRef.init();
    return { moduleRef, transactions: moduleRef.get(TransactionManager) };
  } catch (error: unknown) {
    throw new Error(`Failed to compile concurrency actor "${label}": ${String(error)}`, {
      cause: error,
    });
  } finally {
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
  }
}

export async function createConcurrencyTestContext(
  label: string,
  imports: NonNullable<ModuleMetadata['imports']>,
): Promise<ConcurrencyTestContext> {
  const disposable = await createDisposableDatabase(label);
  const actors: ConcurrencyActor[] = [];

  async function spawnActor(actorLabel: string): Promise<ConcurrencyActor> {
    const { moduleRef, transactions } = await compileActor(actorLabel, disposable.url, imports);
    const actor: ConcurrencyActor = {
      label: actorLabel,
      get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
      inTransaction: (work, options) => transactions.runInTransaction(work, options),
      snapshot: async <T extends Record<string, unknown> = Record<string, unknown>>(
        query: ReturnType<typeof sql>,
      ): Promise<T[]> => (await disposable.client.db.execute(query)).rows as T[],
      close: () => moduleRef.close(),
    };
    actors.push(actor);
    return actor;
  }

  return {
    disposable,
    spawnActor,
    reset: () => truncateAllTables(disposable.client.db),
    close: async () => {
      await Promise.all(actors.splice(0).map((actor) => actor.close()));
      await disposable.drop();
    },
  };
}
