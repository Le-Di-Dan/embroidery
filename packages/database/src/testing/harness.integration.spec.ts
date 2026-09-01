/**
 * DB7-CP2 §9.5/§9.6 — the integration harness proves itself.
 *
 * If the harness silently produced a database that did not match the DB6
 * baseline, every repository suite built on it would be testing the wrong
 * schema. So the harness runs the committed DB6 checkers and the fingerprint
 * gate against its own output.
 */
import { sql } from 'drizzle-orm';

import { newId } from '../primitives/identifiers';
import { createDisposableDatabase, disposableDatabaseName } from './disposable-database';
import type { DisposableDatabase } from './disposable-database';
import { truncateAllTables } from './reset-database';
import { verifySchemaBaseline } from './verify-schema-baseline';

describe('integration harness', () => {
  describe('database naming', () => {
    it('produces a deterministic, injection-safe identifier', () => {
      const name = disposableDatabaseName('CP2 Error/Mapping');

      expect(name).toBe(`embroidery_db7_cp2_error_mapping_${process.pid}`);
      expect(name).toMatch(/^[a-z0-9_]+$/);
      expect(name.length).toBeLessThanOrEqual(63);
    });

    it('stays inside the identifier limit for a long label', () => {
      const name = disposableDatabaseName('a'.repeat(200));
      expect(name.length).toBe(63);
    });

    it('separates concurrent Jest workers, which are separate processes', () => {
      expect(disposableDatabaseName('same-label')).toContain(String(process.pid));
    });
  });

  describe('provisioned database', () => {
    let disposable: DisposableDatabase;

    beforeAll(async () => {
      disposable = await createDisposableDatabase('cp2-harness');
    }, 120_000);

    afterAll(async () => {
      await disposable?.drop();
    });

    it('reproduces the frozen DB6 baseline — all six checkers and the fingerprint gate', async () => {
      const result = await verifySchemaBaseline(disposable.url);

      const failures = result.stages.filter((stage) => !stage.passed);
      expect(failures).toEqual([]);
      expect(result.passed).toBe(true);
      expect(result.stages).toHaveLength(7);
      // Last moved by APP12-DB01 (migration 0038 — `orders.origin`, the
      // origin-aware CHECKs, `ORDER_ACCESS` and the origin guard triggers).
      // The literal is repeated here rather than read from the canonical file
      // on purpose: a test that reads the same file it verifies would keep
      // passing through an unreviewed baseline edit. It had gone stale at
      // 0035/0036/0037, which added no counterpart update here; APP12-DB01
      // repaired it along with the two counts below.
      expect(result.stages.at(-1)?.summary).toContain(
        '0bb3a11c0b48128192674f085b57bc5eca4cc12f40ef14dcacfc70f848f7b626',
      );
    }, 120_000);

    it('applied all 38 migrations', async () => {
      const result = await disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      expect(Number(result.rows[0]?.count)).toBe(38);
    });

    it('resets state between tests without disabling the S24 triggers', async () => {
      await disposable.client.db.execute(sql`
        insert into audit_events
          (occurred_at, actor_kind, system_job_key, action, target_kind, target_id, correlation_id)
        values (now(), 'SYSTEM', 'db7-probe', 'PROBE', 'ORDER', ${newId()}, ${newId()})
      `);

      await truncateAllTables(disposable.client.db);

      const remaining = await disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from audit_events`,
      );
      expect(Number(remaining.rows[0]?.count)).toBe(0);

      // The trigger is still armed afterwards — truncation must not be a way to
      // quietly disarm the immutability guards for the rest of the suite.
      const triggers = await disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from pg_trigger where not tgisinternal`,
      );
      expect(Number(triggers.rows[0]?.count)).toBe(37);
    });

    it('leaves the migration history intact after a reset', async () => {
      await truncateAllTables(disposable.client.db);

      const result = await disposable.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      expect(Number(result.rows[0]?.count)).toBe(38);
    });
  });

  describe('cleanup', () => {
    it('drops the database and tolerates a second drop', async () => {
      const disposable = await createDisposableDatabase('cp2-cleanup');
      const { name } = disposable;

      await disposable.drop();
      await expect(disposable.drop()).resolves.toBeUndefined();

      const probe = await createDisposableDatabase('cp2-cleanup-probe');
      try {
        const result = await probe.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from pg_database where datname = ${name}`,
        );
        expect(Number(result.rows[0]?.count)).toBe(0);
      } finally {
        await probe.drop();
      }
    }, 120_000);
  });
});
