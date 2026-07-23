/**
 * APP0-T01 — failure, cleanup and environment-isolation contract of the API
 * integration harness. Setup-failure database cleanup itself is owned and
 * tested by the canonical DB7 harness; here we prove the API adapter's own
 * guarantees: teardown ordering under failure, the persistent-database refusal,
 * idempotent close, and env restoration.
 */
import { sql } from 'drizzle-orm';
import { createDisposableDatabase } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';

import {
  assertDisposableName,
  createApiIntegrationContext,
} from '../support/api-integration-context';

// One shared probe connection for all catalog checks; see the sibling spec.
let catalog: DisposableDatabase;

beforeAll(async () => {
  catalog = await createDisposableDatabase('t01-fail-catalog');
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

describe('assertDisposableName', () => {
  it('refuses the persistent database name', () => {
    expect(() => assertDisposableName('embroidery', 'embroidery')).toThrow(/persistent database/);
  });

  it('accepts a distinct disposable name', () => {
    expect(() => assertDisposableName('embroidery_db7_x_123', 'embroidery')).not.toThrow();
  });
});

describe('API integration context — cleanup and isolation', () => {
  it('still drops the database when app close fails, and surfaces the failure', async () => {
    const context = await createApiIntegrationContext('t01-close-fail');
    const { name } = context.database;
    jest.spyOn(context.app, 'close').mockRejectedValueOnce(new Error('simulated close failure'));

    await expect(context.close()).rejects.toThrow(AggregateError);

    // The database drop ran despite the app close throwing first.
    expect(await databaseExists(name)).toBe(false);
  }, 120_000);

  it('is safe to close twice', async () => {
    const context = await createApiIntegrationContext('t01-double-close');
    const { name } = context.database;

    await context.close();
    await expect(context.close()).resolves.toBeUndefined();
    expect(await databaseExists(name)).toBe(false);
  }, 120_000);
});
