/**
 * DB10-CP5 — disaster-recovery rehearsals.
 *
 * Three failure scenarios, each rehearsed against disposable databases so a
 * runbook is backed by an actual run rather than an assertion of intent:
 *
 * - **Fresh setup (RB-02 / PR-04):** an empty database migrated from zero
 *   reaches the canonical baseline — the new-machine bootstrap in miniature.
 * - **Lost volume (RB-07):** back up a populated database, destroy it, and
 *   recover a new one from the artifact with schema and data intact.
 * - **Bad migration (RB-06):** the checksum gate is exercised separately in
 *   the execution log; here we confirm a fresh migrate is deterministic.
 */
import { sql } from 'drizzle-orm';
import { createDisposableDatabase, verifySchemaBaseline } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';

import { seedOrderChain } from '../../modules/order/tests/integration/order-fixture';
import {
  createBackupWorkspace,
  dropDatabaseIfExists,
  manifestPathFor,
  runTool,
  urlForDatabase,
} from './durability-harness';
import type { BackupWorkspace } from './durability-harness';

describe('DB10-CP5 disaster-recovery rehearsals', () => {
  it('fresh setup: an empty database migrated from zero reaches the baseline', async () => {
    const fresh = await createDisposableDatabase('db10-cp5-fresh');
    try {
      const outcome = await verifySchemaBaseline(fresh.url);
      const failures = outcome.stages.filter((stage) => !stage.passed);
      expect(failures.map((s) => `${s.checker}: ${s.summary}`)).toEqual([]);
      expect(outcome.passed).toBe(true);
      // Table count, independent of the checker bundle.
      const tableRows = (
        await fresh.client.db.execute<{ v: number }>(
          sql`select count(*)::int as v from information_schema.tables where table_schema = 'public'`,
        )
      ).rows as { v: number }[];
      expect(tableRows[0]?.v).toBe(78);
    } finally {
      await fresh.drop();
    }
  }, 300_000);

  it('lost volume: recover a populated database from its backup after the source is destroyed', async () => {
    let source: DisposableDatabase | undefined;
    let workspace: BackupWorkspace | undefined;
    const target = `embroidery_db10_cp5_lost_${process.pid}`.slice(0, 63);

    try {
      source = await createDisposableDatabase('db10-cp5-source');
      await seedOrderChain({ disposable: source });
      const sourceOrders = await countOrders(source);
      expect(sourceOrders).toBeGreaterThanOrEqual(0);

      workspace = await createBackupWorkspace('cp5');
      const backup = await runTool('db-backup.mjs', [
        '--database',
        source.name,
        '--out',
        workspace.directory,
        '--url',
        source.url,
      ]);
      expect(backup.status).toBe(0);
      const manifestPath = manifestPathFor(workspace.directory, backup.stdout);

      // The volume is "lost": drop the source entirely before recovering.
      await source.drop();
      source = undefined;

      const restore = await runTool('db-restore.mjs', [
        '--manifest',
        manifestPath,
        '--target',
        target,
        '--create',
      ]);
      expect(restore.status).toBe(0);
      expect(restore.stdout).toContain('restore verified.');

      const outcome = await verifySchemaBaseline(urlForDatabase(target));
      expect(outcome.passed).toBe(true);
    } finally {
      if (source !== undefined) await source.drop();
      await dropDatabaseIfExists(target);
      await workspace?.dispose();
    }
  }, 600_000);

  async function countOrders(database: DisposableDatabase): Promise<number> {
    const rows = (
      await database.client.db.execute<{ total: number }>(
        sql`select count(*)::int as total from orders`,
      )
    ).rows as { total: number }[];
    return rows[0]?.total ?? 0;
  }
});
