import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { CleanupStack } from '@embroidery/test-utils';
import {
  createDisposableDatabase,
  resolveDatabaseUrl,
  type DisposableDatabase,
} from '@embroidery/database/testing';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import { AppModule } from '../../src/bootstrap/app.module';
import { applyOfflineObjectStorageEnv } from '../../src/openapi/generation-environment';
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
  /**
   * Optional provider overrides, applied before `compile()`.
   *
   * Added by `APP4-B06`, whose limiter suite replaces the platform rate
   * limiter's clock so a sixty-second window is provable without waiting one.
   * Optional and applied only when supplied, so every existing suite compiles
   * exactly the graph it always did.
   */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<ApiIntegrationTestContext> {
  const cleanup = new CleanupStack();
  const database = await createDisposableDatabase(label);
  cleanup.push('drop database', () => database.drop());
  assertDisposableName(database.name, persistentDatabaseName());

  const previousUrl = process.env['DATABASE_URL'];
  const previousNodeEnv = process.env['NODE_ENV'];
  process.env['DATABASE_URL'] = database.url;
  process.env['NODE_ENV'] = 'test';
  // `APP3-B07` composes `DesignModule`, whose config refuses to resolve without
  // a pepper (`IMP-D043` PO-02). Supplied here as a synthetic test value rather
  // than by weakening the production requirement — a fallback would make the
  // one rule that keeps a stolen database useless optional in production too.
  const restoreDesignSessionEnv = applyDesignSessionTestEnv();
  // `APP7-B03` composes `CustomerDepositModule`, whose config refuses to resolve
  // without all four merchant bank values (`APP7-G01` §3). Synthetic, and
  // supplied here rather than by weakening the production requirement — a
  // fallback would let a deployment ship a deposit surface with no account.
  const restoreMerchantBankEnv = applyMerchantBankTestEnv();
  // Non-connecting object-storage placeholders unless the caller already set
  // real ones — an upload suite points them at a live disposable MinIO.
  const restoreStorageEnv = applyOfflineObjectStorageEnv();

  const logs = new RecordingLogSink();

  try {
    const builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LOG_SINK)
      .useValue(logs);
    const moduleRef = await (configure === undefined ? builder : configure(builder)).compile();

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
    restoreStorageEnv();
    restoreDesignSessionEnv();
    restoreMerchantBankEnv();
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

/**
 * The synthetic merchant bank account every booted API needs (`APP7-B03`).
 *
 * Exported so a deposit suite asserts the response against **these exact
 * values** rather than against whatever the response happened to contain. A
 * deliberately obvious non-account: no real bank BIN, no real account number.
 */
export const MERCHANT_BANK_TEST_CONFIG = {
  bankBin: '970418',
  accountNumber: '31410000123456',
  accountName: 'CONG TY TNHH THEU TEST',
  bankDisplayName: 'Ngan Hang Test',
} as const;

export function applyMerchantBankTestEnv(): () => void {
  const names = [
    ['PAYMENT_MERCHANT_BANK_BIN', MERCHANT_BANK_TEST_CONFIG.bankBin],
    ['PAYMENT_MERCHANT_ACCOUNT_NUMBER', MERCHANT_BANK_TEST_CONFIG.accountNumber],
    ['PAYMENT_MERCHANT_ACCOUNT_NAME', MERCHANT_BANK_TEST_CONFIG.accountName],
    ['PAYMENT_MERCHANT_BANK_DISPLAY_NAME', MERCHANT_BANK_TEST_CONFIG.bankDisplayName],
  ] as const;
  const previous = names.map(([name]) => [name, process.env[name]] as const);
  for (const [name, value] of names) {
    process.env[name] = value;
  }
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/** The synthetic Design Session environment every booted API needs (APP3-B07). */
export const DESIGN_SESSION_TEST_ORIGIN = 'http://embroidery.test';

export function applyDesignSessionTestEnv(): () => void {
  const names = [
    ['DESIGN_SESSION_SECRET_PEPPER', 'test-design-session-pepper-0123456789abcdef'],
    ['DESIGN_SESSION_ALLOWED_ORIGINS', DESIGN_SESSION_TEST_ORIGIN],
    ['DESIGN_SESSION_COOKIE_SECURE', 'false'],
  ] as const;
  const previous = names.map(([name]) => [name, process.env[name]] as const);
  for (const [name, value] of names) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}
