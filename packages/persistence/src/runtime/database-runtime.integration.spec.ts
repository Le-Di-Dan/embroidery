/**
 * DB7-CP1 — database runtime foundation, against a real PostgreSQL instance.
 *
 * Every assertion that depends on database behaviour runs against a disposable
 * database created for this suite; nothing here mocks the driver, because a
 * mocked pool cannot prove pool lifecycle, connection release or credential
 * redaction.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { loadDatabaseConfig } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import { DatabaseModule } from '../database.module';
import { DATABASE_CONNECTION } from './database.tokens';
import { DatabaseConnection } from './database-connection';
import { DatabaseExecutor } from './database-executor';
import { DatabaseHealthService } from '../health/database-health.service';
import { TransactionManager } from '../transaction/transaction-manager';

/** A password that must never appear in any message this suite provokes. */
const SECRET = 'super_secret_password_do_not_leak';

describe('database runtime (integration)', () => {
  let disposable: DisposableDatabase;
  let moduleRef: TestingModule;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('cp1-runtime');

    // DatabaseModule reads process.env at provider-construction time, which is
    // the behaviour under test: a misconfigured process must fail at bootstrap.
    previousUrl = process.env['DATABASE_URL'];
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';

    moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
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

  describe('module wiring', () => {
    it('exports the executor, transaction manager and health service', () => {
      expect(moduleRef.get(DatabaseExecutor)).toBeInstanceOf(DatabaseExecutor);
      expect(moduleRef.get(TransactionManager)).toBeInstanceOf(TransactionManager);
      expect(moduleRef.get(DatabaseHealthService)).toBeInstanceOf(DatabaseHealthService);
    });

    it('creates exactly one connection for the application instance', () => {
      const first = moduleRef.get<DatabaseConnection>(DATABASE_CONNECTION);
      const second = moduleRef.get<DatabaseConnection>(DATABASE_CONNECTION);
      expect(first).toBe(second);
    });
  });

  describe('connect and query', () => {
    it('runs a query through the pooled handle', async () => {
      const executor = moduleRef.get(DatabaseExecutor);
      const result = await executor.current().execute('SELECT 1 AS one');
      expect(result.rows[0]).toEqual({ one: 1 });
    });

    it('applied the DB6 schema — the canonical table count is present', async () => {
      const executor = moduleRef.get(DatabaseExecutor);
      const result = await executor
        .current()
        .execute<{ count: string }>(
          "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public'",
        );
      expect(Number(result.rows[0]?.count)).toBe(78);
    });
  });

  describe('connection release', () => {
    it('returns every connection to the pool after a batch of queries', async () => {
      const executor = moduleRef.get(DatabaseExecutor);
      const connection = moduleRef.get<DatabaseConnection>(DATABASE_CONNECTION);

      await Promise.all(
        Array.from({ length: 8 }, () => executor.current().execute('SELECT pg_backend_pid()')),
      );

      // Poll briefly: `pg` releases asynchronously, so an immediate read can
      // observe a connection that is on its way back rather than a leak.
      const stats = await eventually(
        () => connection.poolStats,
        (value) => value.idle === value.total && value.waiting === 0,
      );

      expect(stats.waiting).toBe(0);
      expect(stats.idle).toBe(stats.total);
      expect(stats.total).toBeLessThanOrEqual(stats.max);
    });
  });

  describe('health', () => {
    it('reports up with pool statistics and a latency figure', async () => {
      const health = await moduleRef.get(DatabaseHealthService).check();
      expect(health.status).toBe('up');
      expect(health.reason).toBe('ok');
      expect(health.latencyMs).not.toBeNull();
      expect(health.pool.max).toBeGreaterThan(0);
    });

    it('does not expose the connection URL, user or password anywhere in its result', async () => {
      const health = await moduleRef.get(DatabaseHealthService).check();
      const serialised = JSON.stringify(health);
      expect(serialised).not.toContain('postgres://');
      expect(serialised).not.toContain('embroidery_dev_password');
    });

    it('classifies an unreachable server as a connection failure, not a query failure', async () => {
      // Port 1 is reserved and never listening, so this fails at connect time.
      const connection = new DatabaseConnection(
        loadDatabaseConfig({
          NODE_ENV: 'test',
          DATABASE_URL: `postgres://someone:${SECRET}@127.0.0.1:1/embroidery`,
          DATABASE_CONNECTION_TIMEOUT_MS: '2000',
        }),
      );
      try {
        const health = await new DatabaseHealthService(connection).check();
        expect(health.status).toBe('down');
        expect(health.reason).toBe('connection_failed');
        expect(JSON.stringify(health)).not.toContain(SECRET);
      } finally {
        await connection.close();
      }
    });

    it('classifies a missing database as a configuration failure', async () => {
      const connection = new DatabaseConnection(
        loadDatabaseConfig({
          NODE_ENV: 'test',
          DATABASE_URL: replaceDatabaseName(disposable.url, 'embroidery_db7_absent'),
          DATABASE_CONNECTION_TIMEOUT_MS: '5000',
        }),
      );
      try {
        const health = await new DatabaseHealthService(connection).check();
        expect(health.status).toBe('down');
        expect(health.reason).toBe('configuration_failed');
      } finally {
        await connection.close();
      }
    });
  });

  describe('startup validation', () => {
    it('fails fast and redacts the credential when the server is unreachable', async () => {
      const connection = new DatabaseConnection(
        loadDatabaseConfig({
          NODE_ENV: 'test',
          DATABASE_URL: `postgres://someone:${SECRET}@127.0.0.1:1/embroidery`,
          DATABASE_CONNECTION_TIMEOUT_MS: '2000',
        }),
      );

      await expect(connection.validate()).rejects.toThrow(/startup validation failed/);
      await expect(connection.validate()).rejects.not.toThrow(new RegExp(SECRET));
    });

    it('closes the partially-created pool when validation fails', async () => {
      const connection = new DatabaseConnection(
        loadDatabaseConfig({
          NODE_ENV: 'test',
          DATABASE_URL: `postgres://someone:${SECRET}@127.0.0.1:1/embroidery`,
          DATABASE_CONNECTION_TIMEOUT_MS: '2000',
        }),
      );

      await expect(connection.validate()).rejects.toThrow();
      // A closed connection refuses to hand out a handle, which is how a failed
      // startup is prevented from limping on with an unusable pool.
      expect(() => connection.database).toThrow(/has been closed/);
    });
  });

  describe('shutdown', () => {
    it('closes the pool once and tolerates a second close', async () => {
      const disposableForShutdown = await createDisposableDatabase('cp1-shutdown');
      try {
        const connection = new DatabaseConnection(disposableForShutdown.config);
        await connection.validate();
        await connection.close();
        await expect(connection.close()).resolves.toBeUndefined();
        expect(() => connection.database).toThrow(/has been closed/);
      } finally {
        await disposableForShutdown.drop();
      }
    });
  });
});

function replaceDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function eventually<T>(
  read: () => T,
  predicate: (value: T) => boolean,
  attempts = 50,
): Promise<T> {
  let value = read();
  for (let attempt = 0; attempt < attempts && !predicate(value); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    value = read();
  }
  return value;
}
