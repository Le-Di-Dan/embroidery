/**
 * APP0-T01 — the application integration harness proves itself.
 *
 * Boots the real `AppModule` against a fresh, fully migrated disposable
 * PostgreSQL database (canonical DB7 harness) and drives it over HTTP, so every
 * later API integration suite has an evidenced foundation: real routing, real
 * request context, real database readiness — never a mock.
 */
import { sql } from 'drizzle-orm';
import { createDisposableDatabase, verifySchemaBaseline } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';

import { PLATFORM_LOG_EVENT } from '../../src/platform/logging/log-record';
import { createApiIntegrationContext } from '../support/api-integration-context';
import type { ApiIntegrationTestContext } from '../support/api-integration-context';

const PERSISTENT_DATABASE = 'embroidery';

// Canonical DB6 baseline fingerprint (DEC-DB7-005); recomputing it here would
// duplicate the verifier, so the frozen value is asserted against the verifier
// output instead. Moved by APP2-DB01 (migration 0032 adds the CATALOG_PREVIEW
// derivative kind and the INV-22 watermark CHECK): 31 → 32 migrations,
// `4ca56a59…` → `82864268…`. Table count is unchanged, which is the point.
// Moved again by APP2-B02-G01 (migration 0033 provisions the fixed catalog
// categories): 32 → 33 migrations, and because that migration is **data only**
// the fingerprint and table count both stay exactly where they are.
const CANONICAL_FINGERPRINT = '82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf';
const CANONICAL_MIGRATION_COUNT = 33;
const CANONICAL_TABLE_COUNT = 78;

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

describe('API integration harness — canonical schema/fingerprint verification', () => {
  it('provisions a database that passes canonical schema verification, then drops it', async () => {
    const context = await createApiIntegrationContext('t01-schema-proof');
    const { name } = context.database;
    try {
      // Reuse the canonical DB6 checkers + fingerprint gate — never a
      // reimplementation — against the exact database the adapter provisioned.
      const baseline = await verifySchemaBaseline(context.database.url);
      expect(baseline.stages.filter((stage) => !stage.passed)).toEqual([]);
      expect(baseline.passed).toBe(true);
      expect(baseline.stages).toHaveLength(7);
      expect(baseline.stages.at(-1)?.summary).toContain(CANONICAL_FINGERPRINT);

      const migrations = await context.database.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      expect(Number(migrations.rows[0]?.count)).toBe(CANONICAL_MIGRATION_COUNT);

      const tables = await context.database.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from information_schema.tables where table_schema = 'public'`,
      );
      expect(Number(tables.rows[0]?.count)).toBe(CANONICAL_TABLE_COUNT);
    } finally {
      await context.close();
    }

    // The adapter lifecycle dropped the provisioned database.
    expect(await databaseExists(name)).toBe(false);
  }, 180_000);
});
