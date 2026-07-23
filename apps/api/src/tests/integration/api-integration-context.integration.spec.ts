/**
 * APP0-T01 — the application integration harness proves itself.
 *
 * Boots the real `AppModule` against a fresh, fully migrated disposable
 * PostgreSQL database (canonical DB7 harness) and drives it over HTTP, so every
 * later API integration suite has an evidenced foundation: real routing, real
 * request context, real database readiness — never a mock.
 */
import { sql } from 'drizzle-orm';
import { createDisposableDatabase } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';

import { PLATFORM_LOG_EVENT } from '../../platform/logging/log-record';
import { createApiIntegrationContext } from '../support/api-integration-context';
import type { ApiIntegrationTestContext } from '../support/api-integration-context';

const PERSISTENT_DATABASE = 'embroidery';

// One long-lived probe connection answers all catalog questions, so existence
// checks never create-and-migrate a throwaway database per assertion. Exact
// database names (pid-scoped) are used — never a server-wide pattern, which a
// parallel Jest worker's databases would race.
let catalog: DisposableDatabase;

beforeAll(async () => {
  catalog = await createDisposableDatabase('t01-catalog');
}, 120_000);

afterAll(async () => {
  await catalog?.drop();
});

async function databaseExists(name: string): Promise<boolean> {
  const result = await catalog.client.db.execute<{ count: string }>(
    sql`select count(*)::text as count from pg_database where datname = ${name}`,
  );
  return Number(result.rows[0]?.count) > 0;
}

describe('API integration harness — real AppModule + disposable PostgreSQL', () => {
  const envUrlBefore = process.env['DATABASE_URL'];
  const envNodeBefore = process.env['NODE_ENV'];
  let context: ApiIntegrationTestContext;

  beforeAll(async () => {
    context = await createApiIntegrationContext('t01-readiness');
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it('provisions a recognizable disposable database, never the persistent one', () => {
    expect(context.database.name).toMatch(/^embroidery_db7_t01_readiness_\d+$/);
    expect(context.database.name).not.toBe(PERSISTENT_DATABASE);
  });

  it('restores DATABASE_URL/NODE_ENV after setup (no leaked env mutation)', () => {
    expect(process.env['DATABASE_URL']).toBe(envUrlBefore);
    expect(process.env['NODE_ENV']).toBe(envNodeBefore);
  });

  it('serves GET /api/health/readiness as ready against the real database', async () => {
    const response = await context.http.get('/api/health/readiness');

    expect(response.status).toBe(200);
    const body = response.body as {
      status: string;
      service: string;
      database: { status: string; reason: string; pool: { max: number } };
      timestamp: string;
    };
    expect(body).toMatchObject({
      status: 'ready',
      service: 'api',
      database: { status: 'up', reason: 'ok' },
    });
    // Real readiness, not a stub: the pool statistics come from the live pool.
    expect(typeof body.database.pool.max).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('keeps the health liveness body raw (envelope opt-out preserved)', async () => {
    const response = await context.http.get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'api' });
    // Not wrapped in the standard success envelope.
    expect(response.body).not.toHaveProperty('data');
    expect(response.body).not.toHaveProperty('meta');
    expect(response.body).not.toHaveProperty('success');
  });

  it('captures exactly one structured completion log with a valid request id', async () => {
    context.logs.records.length = 0;
    await context.http.get('/api/health/readiness');

    const completions = context.logs
      .byEvent(PLATFORM_LOG_EVENT.HTTP_REQUEST_COMPLETED)
      .filter((record) => record.http?.route === '/api/health/readiness');

    expect(completions).toHaveLength(1);
    const record = completions[0];
    expect(record?.http).toMatchObject({
      method: 'GET',
      route: '/api/health/readiness',
      statusCode: 200,
    });
    expect(typeof record?.requestId).toBe('string');
    expect((record?.requestId ?? '').length).toBeGreaterThan(0);
  });

  it('leaves the persistent database present and untouched while running', async () => {
    // No mutating statement ever targets the persistent database; it only ever
    // exists here as a read-only catalog fact.
    expect(await databaseExists(PERSISTENT_DATABASE)).toBe(true);
  });
});

describe('API integration harness — sequential isolation', () => {
  it('gives two sequential contexts distinct databases, each dropped after close', async () => {
    const first = await createApiIntegrationContext('t01-run-a');
    const firstName = first.database.name;
    expect(await databaseExists(firstName)).toBe(true);
    await first.close();
    expect(await databaseExists(firstName)).toBe(false);

    const second = await createApiIntegrationContext('t01-run-b');
    const secondName = second.database.name;
    expect(await databaseExists(secondName)).toBe(true);
    await second.close();
    expect(await databaseExists(secondName)).toBe(false);

    expect(firstName).not.toBe(secondName);
  }, 180_000);
});
