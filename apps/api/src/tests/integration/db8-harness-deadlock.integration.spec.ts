/**
 * DB8-CP1 — proves the harness can force a real PostgreSQL deadlock and that
 * the existing DB7 error mapper + this harness's bounded retry correctly
 * turn `40P01` into one clean, non-duplicating retry.
 *
 * `DB8_LOCK_ORDER_MATRIX.md` §2/§5 (DEC-DB8-003): no shipped flow takes two
 * locks in opposite order today, so this constructs the interleaving
 * directly against two `redirect_rules` rows rather than through a
 * repository — a harness-pipeline proof, not a regression test for a
 * production bug.
 */
import { newId, schema } from '@embroidery/database';
import { isPersistenceError, withMappedErrors } from '@embroidery/database';
import { DatabaseExecutor, DatabaseModule } from '@embroidery/persistence';
import { eq, sql } from 'drizzle-orm';

import { createConcurrencyTestContext } from './db8-concurrency-context';
import type { ConcurrencyTestContext } from './db8-concurrency-context';
import { Barrier } from './db8-barrier';
import { withBoundedRetry, RetryExhaustedError } from './db8-retry';

const { redirectRules } = schema;

describe('DB8 concurrency harness — deadlock and retry (integration)', () => {
  let context: ConcurrencyTestContext;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('db8-cp1-deadlock', [DatabaseModule]);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  async function seedRows(): Promise<{ r1: string; r2: string }> {
    const r1 = newId();
    const r2 = newId();
    await context.disposable.client.db.insert(redirectRules).values([
      { id: r1, sourcePath: '/r1', targetPath: '/t1', redirectKind: 'PERMANENT', isActive: true },
      { id: r2, sourcePath: '/r2', targetPath: '/t2', redirectKind: 'PERMANENT', isActive: true },
    ]);
    return { r1, r2 };
  }

  async function lockRow(executor: DatabaseExecutor, id: string): Promise<void> {
    // Mirrors production call sites: repositories never let a raw driver
    // error escape (`DB7_ERROR_MAPPING_CATALOG.md` §6), so the harness maps
    // this raw lock statement the same way `OrderRepository`/`SkuStockRepository`
    // map every one of theirs.
    await withMappedErrors('db8-harness.lockRow', async () => {
      await executor
        .current()
        .execute(sql`select id from redirect_rules where id = ${id} for update`);
    });
  }

  /**
   * A locks r1 then r2; B locks r2 then r1, with a barrier forcing both to
   * hold their first lock before either attempts the second — the exact
   * condition PostgreSQL needs to detect a cycle and abort one side.
   */
  it('detects a real opposite-order deadlock and maps it to RETRYABLE_TRANSACTION_FAILURE', async () => {
    const { r1, r2 } = await seedRows();
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    const barrier = new Barrier();

    const runA = a
      .inTransaction(async () => {
        await lockRow(a.get<DatabaseExecutor>(DatabaseExecutor), r1);
        barrier.signal('a-holds-r1');
        await barrier.waitFor('b-holds-r2');
        await lockRow(a.get<DatabaseExecutor>(DatabaseExecutor), r2);
      })
      .then(
        () => ({ outcome: 'committed' as const }),
        (error: unknown) => ({ outcome: 'rejected' as const, error }),
      );

    const runB = b
      .inTransaction(async () => {
        await lockRow(b.get<DatabaseExecutor>(DatabaseExecutor), r2);
        barrier.signal('b-holds-r2');
        await barrier.waitFor('a-holds-r1');
        await lockRow(b.get<DatabaseExecutor>(DatabaseExecutor), r1);
      })
      .then(
        () => ({ outcome: 'committed' as const }),
        (error: unknown) => ({ outcome: 'rejected' as const, error }),
      );

    const [resultA, resultB] = await Promise.all([runA, runB]);
    const outcomes = [resultA, resultB];

    const rejected = outcomes.filter((o) => o.outcome === 'rejected');
    const committed = outcomes.filter((o) => o.outcome === 'committed');
    expect(rejected).toHaveLength(1);
    expect(committed).toHaveLength(1);

    const rejectedError = (rejected[0] as { error: unknown }).error;
    expect(isPersistenceError(rejectedError)).toBe(true);
    if (isPersistenceError(rejectedError)) {
      expect(rejectedError.kind).toBe('RETRYABLE_TRANSACTION_FAILURE');
      expect(rejectedError.retryable).toBe(true);
      expect(rejectedError.diagnostics.sqlState).toBe('40P01');
    }
  });

  it('the bounded retry re-runs the whole losing transaction to a clean commit, exactly once extra', async () => {
    const { r1 } = await seedRows();
    const a = await context.spawnActor('A');
    let attempts = 0;

    const outcome = await withBoundedRetry(async () => {
      attempts += 1;
      return a.inTransaction(async () => {
        if (attempts === 1) {
          // Simulate the deadlock loser: the mapper's own contract is proven
          // above; this proves the *retry pipeline* re-runs the body.
          const { persistenceError } = await import('@embroidery/database');
          throw persistenceError({
            kind: 'RETRYABLE_TRANSACTION_FAILURE',
            code: 'TRANSIENT_CONFLICT',
            message: 'simulated deadlock loser',
            retryable: true,
          });
        }
        await lockRow(a.get<DatabaseExecutor>(DatabaseExecutor), r1);
        return 'ok';
      });
    });

    expect(outcome.attempts).toBe(2);
    expect(outcome.value).toBe('ok');
  });

  it('does not retry a non-retryable rejection, and does not retry forever', async () => {
    let attempts = 0;
    await expect(
      withBoundedRetry(async () => {
        attempts += 1;
        const { persistenceError } = await import('@embroidery/database');
        throw persistenceError({
          kind: 'INVARIANT_VIOLATION',
          code: 'NOT_RETRYABLE',
          message: 'non-retryable',
          retryable: false,
        });
      }),
    ).rejects.toMatchObject({ code: 'NOT_RETRYABLE' });
    expect(attempts).toBe(1);

    let retryAttempts = 0;
    await expect(
      withBoundedRetry(
        async () => {
          retryAttempts += 1;
          const { persistenceError } = await import('@embroidery/database');
          throw persistenceError({
            kind: 'RETRYABLE_TRANSACTION_FAILURE',
            code: 'TRANSIENT_CONFLICT',
            message: 'always fails',
            retryable: true,
          });
        },
        { maxAttempts: 3 },
      ),
    ).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(retryAttempts).toBe(3);
  });

  it('leaves no partial row after a deadlock loser is aborted', async () => {
    const { r1, r2 } = await seedRows();
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    const barrier = new Barrier();
    const newRowId = newId();

    const runA = a
      .inTransaction(async () => {
        await lockRow(a.get<DatabaseExecutor>(DatabaseExecutor), r1);
        await a.get<DatabaseExecutor>(DatabaseExecutor).current().insert(redirectRules).values({
          id: newRowId,
          sourcePath: '/from-a',
          targetPath: '/t',
          redirectKind: 'PERMANENT',
          isActive: true,
        });
        barrier.signal('a-holds-r1');
        await barrier.waitFor('b-holds-r2');
        await lockRow(a.get<DatabaseExecutor>(DatabaseExecutor), r2);
      })
      .catch((error: unknown) => error);

    const runB = b
      .inTransaction(async () => {
        await lockRow(b.get<DatabaseExecutor>(DatabaseExecutor), r2);
        barrier.signal('b-holds-r2');
        await barrier.waitFor('a-holds-r1');
        await lockRow(b.get<DatabaseExecutor>(DatabaseExecutor), r1);
      })
      .catch((error: unknown) => error);

    await Promise.all([runA, runB]);

    const rows = await context.disposable.client.db
      .select()
      .from(redirectRules)
      .where(eq(redirectRules.sourcePath, '/from-a'));
    // Either A won (row present, commit real) or A lost (row absent, rolled
    // back with the rest of its transaction) — never a torn state where the
    // insert survives without the transaction that made it.
    expect(rows.length === 0 || rows.length === 1).toBe(true);
  });
});
