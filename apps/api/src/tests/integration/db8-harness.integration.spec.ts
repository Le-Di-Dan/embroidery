/**
 * DB8-CP1 — proves the concurrency harness itself before any race scenario
 * relies on it: real independent connections, deterministic barriers,
 * forced rollback visible across connections, and clean teardown with no
 * cross-test leakage.
 */
import { newId, schema } from '@embroidery/database';
import { DatabaseExecutor, DatabaseModule } from '@embroidery/persistence';
import { eq } from 'drizzle-orm';

import { createConcurrencyTestContext } from './db8-concurrency-context';
import type { ConcurrencyTestContext } from './db8-concurrency-context';
import { Barrier } from './db8-barrier';

const { redirectRules } = schema;

describe('DB8 concurrency harness (integration)', () => {
  let context: ConcurrencyTestContext;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('db8-cp1-harness', [DatabaseModule]);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  async function insertRule(executor: DatabaseExecutor, sourcePath: string): Promise<string> {
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

  it('gives two spawned actors independent connection pools against the same database', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');

    expect(a.get<DatabaseExecutor>(DatabaseExecutor)).not.toBe(
      b.get<DatabaseExecutor>(DatabaseExecutor),
    );

    const rows = await context.disposable.client.db.select().from(redirectRules);
    expect(rows).toHaveLength(0);
  });

  it('lets an uncommitted write on one connection stay invisible to another until commit', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    const barrier = new Barrier();

    const writer = a.inTransaction(async () => {
      await insertRule(a.get<DatabaseExecutor>(DatabaseExecutor), '/uncommitted');
      barrier.signal('inserted');
      await barrier.waitFor('read-done');
    });

    await barrier.waitFor('inserted');
    const seenBeforeCommit = await b.inTransaction(async () =>
      b.get<DatabaseExecutor>(DatabaseExecutor).current().select().from(redirectRules),
    );
    barrier.signal('read-done');
    await writer;

    expect(seenBeforeCommit).toHaveLength(0);
    const seenAfterCommit = await b.inTransaction(async () =>
      b.get<DatabaseExecutor>(DatabaseExecutor).current().select().from(redirectRules),
    );
    expect(seenAfterCommit).toHaveLength(1);
  });

  it('rolls back a throwing transaction so no other connection ever observes it', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');

    await expect(
      a.inTransaction(async () => {
        await insertRule(a.get<DatabaseExecutor>(DatabaseExecutor), '/rolled-back');
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');

    const rows = await b.inTransaction(async () =>
      b.get<DatabaseExecutor>(DatabaseExecutor).current().select().from(redirectRules),
    );
    expect(rows).toHaveLength(0);
  });

  it('orders two actors deterministically through a barrier rather than by timing', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    const barrier = new Barrier();
    const order: string[] = [];

    const first = a.inTransaction(async () => {
      await barrier.waitFor('go-a');
      order.push('A');
      barrier.signal('a-done');
    });
    const second = b.inTransaction(async () => {
      await barrier.waitFor('a-done');
      order.push('B');
    });
    barrier.signal('go-a');

    await Promise.all([first, second]);
    expect(order).toEqual(['A', 'B']);
  });

  it('times out a barrier wait that never receives its signal, rather than hanging', async () => {
    const barrier = new Barrier();
    await expect(barrier.waitFor('never', 50)).rejects.toThrow(/timed out/);
  });

  it('drops the disposable database on close and leaves no actor connection open', async () => {
    const scoped = await createConcurrencyTestContext('db8-cp1-teardown', [DatabaseModule]);
    const a = await scoped.spawnActor('A');
    await a.inTransaction(async () =>
      insertRule(a.get<DatabaseExecutor>(DatabaseExecutor), '/scoped'),
    );

    await scoped.close();

    await expect(a.inTransaction(() => undefined)).rejects.toBeDefined();
  });

  it('reset() truncates between tests without recreating the database', async () => {
    const a = await context.spawnActor('A');
    await a.inTransaction(async () =>
      insertRule(a.get<DatabaseExecutor>(DatabaseExecutor), '/before-reset'),
    );
    expect(await context.disposable.client.db.select().from(redirectRules)).toHaveLength(1);

    await context.reset();

    expect(await context.disposable.client.db.select().from(redirectRules)).toHaveLength(0);
    expect(
      await a.inTransaction(async () =>
        insertRule(a.get<DatabaseExecutor>(DatabaseExecutor), '/after-reset'),
      ),
    ).toBeDefined();
  });

  it('enforces the same real UNIQUE arbiter across two independent connections', async () => {
    const a = await context.spawnActor('A');
    const b = await context.spawnActor('B');
    await a.inTransaction(async () =>
      insertRule(a.get<DatabaseExecutor>(DatabaseExecutor), '/dup'),
    );

    await expect(
      b.inTransaction(async () => insertRule(b.get<DatabaseExecutor>(DatabaseExecutor), '/dup')),
    ).rejects.toBeDefined();

    const rows = await context.disposable.client.db
      .select()
      .from(redirectRules)
      .where(eq(redirectRules.sourcePath, '/dup'));
    expect(rows).toHaveLength(1);
  });
});
