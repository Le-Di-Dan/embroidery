/**
 * Health endpoints against a real database (DB7-CP1).
 *
 * Readiness reports the *actual* pool state, so a mocked health service would
 * only prove that a stub returns what it was told to. The disposable database
 * makes the assertion mean something.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import { HealthController } from './health.controller';
import { HealthModule } from './health.module';

describe('HealthController', () => {
  let disposable: DisposableDatabase;
  let moduleRef: TestingModule;
  let controller: HealthController;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('api-health');
    previousUrl = process.env['DATABASE_URL'];
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';

    moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();
    await moduleRef.init();
    controller = moduleRef.get(HealthController);
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

  it('reports a healthy liveness status with a stable shape', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('reports readiness with a 200 when the database is reachable', async () => {
    const statuses: number[] = [];
    const result = await controller.readiness({ status: (code) => statuses.push(code) });

    expect(statuses).toEqual([200]);
    expect(result.status).toBe('ready');
    expect(result.database.status).toBe('up');
  });

  it('never exposes a connection string or credential in the readiness body', async () => {
    const result = await controller.readiness({ status: () => undefined });
    const serialised = JSON.stringify(result);

    expect(serialised).not.toContain('postgres://');
    expect(serialised).not.toContain('embroidery_dev_password');
  });
});
