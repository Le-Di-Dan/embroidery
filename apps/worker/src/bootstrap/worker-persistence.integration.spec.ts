/**
 * DB7-CP1 §8.2 — the worker application boots on the same persistence
 * foundation as the API, independently and against a real database.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DatabaseHealthService, TransactionManager } from '@embroidery/persistence';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import { JobPollRuntimeService } from '../runtime/poll/job-poll-runtime.service';
import { WorkerModule } from './worker.module';

describe('worker persistence bootstrap (integration)', () => {
  let disposable: DisposableDatabase;
  let moduleRef: TestingModule;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('worker-bootstrap');
    previousUrl = process.env['DATABASE_URL'];
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';

    moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    await moduleRef.init();
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

  it('validates its own pool at startup', async () => {
    const health = await moduleRef.get(DatabaseHealthService).check();
    expect(health.status).toBe('up');
  });

  it('boots the worker application context alongside the persistence runtime', () => {
    expect(moduleRef.get(JobPollRuntimeService)).toBeInstanceOf(JobPollRuntimeService);
  });

  it('can open a transaction from the worker process', async () => {
    const manager = moduleRef.get(TransactionManager);
    const inside = await manager.runInTransaction(() => manager.isInTransaction());

    expect(inside).toBe(true);
    expect(manager.isInTransaction()).toBe(false);
  });
});
