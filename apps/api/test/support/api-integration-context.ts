import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CleanupStack } from '@embroidery/test-utils';
import {
  createDisposableDatabase,
  resolveDatabaseUrl,
  type DisposableDatabase,
} from '@embroidery/database/testing';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import { AppModule } from '../../src/bootstrap/app.module';
import { LOG_SINK } from '../../src/platform/logging/log-sink';
import { RecordingLogSink } from './recording-log-sink';

/** The Supertest agent bound to the running application server. */
export type ApiTestAgent = ReturnType<typeof request>;

export interface ApiIntegrationTestContext {
  /** The disposable PostgreSQL database this context runs against. */
  readonly database: DisposableDatabase;
  /** The real API application, wired from `AppModule`. */
  readonly app: INestApplication;
  /** HTTP client for the in-memory server (no network port is bound). */
  readonly http: ApiTestAgent;
  /** Structured log records captured through the overridden sink. */
  readonly logs: RecordingLogSink;
  /** Closes the app and drops the database, in that order; safe to call twice. */
  close(): Promise<void>;
}

/** Reads the persistent database name from the base URL, for the refusal guard. */
function persistentDatabaseName(): string {
  return new URL(resolveDatabaseUrl()).pathname.replace(/^\//, '');
}

/**
 * Guards against ever pointing a mutating integration context at the persistent
 * development database. The canonical harness already names disposable
 * databases `embroidery_db7_*`, so this can only fail if that contract is
 * broken — which is exactly when the check must fire.
 */
export function assertDisposableName(name: string, persistent: string): void {
  if (name === persistent) {
    throw new Error(
      `Refusing to run an integration context against the persistent database "${persistent}".`,
    );
  }
}

/**
 * Boots the real API against a fresh, fully migrated disposable PostgreSQL
 * database, with the structured log sink captured.
 *
 * Reuses the canonical DB7 harness (`createDisposableDatabase`) for the whole
 * database lifecycle and the shared `AppModule` + `GLOBAL_ROUTE_PREFIX` from the
 * B01 bootstrap for the application graph — no second harness, no duplicated
 * Nest wiring. `DATABASE_URL`/`NODE_ENV` are set only for the module init that
 * reads them and restored in `finally`, so no global env mutation leaks past
 * setup and parallel Jest workers (separate processes) never race.
 */
export async function createApiIntegrationContext(
  label: string,
): Promise<ApiIntegrationTestContext> {
  const cleanup = new CleanupStack();
  const database = await createDisposableDatabase(label);
  cleanup.push('drop database', () => database.drop());
  assertDisposableName(database.name, persistentDatabaseName());

  const previousUrl = process.env['DATABASE_URL'];
  const previousNodeEnv = process.env['NODE_ENV'];
  process.env['DATABASE_URL'] = database.url;
  process.env['NODE_ENV'] = 'test';

  const logs = new RecordingLogSink();

  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LOG_SINK)
      .useValue(logs)
      .compile();

    const app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
    cleanup.push('close app', () => app.close());

    return {
      database,
      app,
      http: request(app.getHttpServer() as Server),
      logs,
      close: () => cleanup.run(),
    };
  } catch (error: unknown) {
    await cleanup.run();
    throw error;
  } finally {
    if (previousUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousUrl;
    }
    if (previousNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = previousNodeEnv;
    }
  }
}
