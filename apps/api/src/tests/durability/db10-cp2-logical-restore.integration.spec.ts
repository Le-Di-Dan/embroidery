/**
 * DB10-CP2 — logical backup and restore rehearsal.
 *
 * A backup that has never been restored is a hypothesis. This suite takes a
 * representative disposable database, backs it up with the real tool,
 * restores it into two independent empty databases, and then proves the
 * restored databases are the same *system* — not merely the same row counts:
 *
 * - the canonical DB6 schema fingerprint and all seven live-catalog checkers;
 * - exact per-table row counts and content checksums on the critical tables;
 * - constraints and S24 triggers still enforcing after the restore;
 * - the application's own repositories reading restored rows;
 * - order → outbox atomicity still transactional on the restored database.
 *
 * Two targets, not one, because a single restore cannot distinguish "the
 * artifact is good" from "that one target happened to work".
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';
import { verifySchemaBaseline } from '@embroidery/database/testing';
import { DATABASE_CONNECTION, OutboxEventStore } from '@embroidery/persistence';

import { createBenchContext } from '../benchmark/bench-context';
import type { BenchContext } from '../benchmark/bench-context';
import { OrderModule } from '../../modules/order/order.module';
import { ORDER_REPOSITORY } from '../../modules/order/domain/repositories/order.repository';
import type {
  CreateOrderInput,
  OrderId,
  OrderRepository,
} from '../../modules/order/domain/repositories/order.repository';
import {
  attachActor,
  createBackupWorkspace,
  databasesMatching,
  dropDatabaseIfExists,
  manifestPathFor,
  readBackupManifest,
  runTool,
  urlForDatabase,
} from './durability-harness';
import type { AttachedActor, BackupManifest, BackupWorkspace } from './durability-harness';

/**
 * The narrow slice of the drizzle client this suite uses for raw probes.
 *
 * `execute` is typed loosely (`unknown` rows) because drizzle's own generic
 * is invariant and would otherwise reject the real client; each caller
 * shapes the rows it reads.
 */
interface RawExecutor {
  execute(query: ReturnType<typeof sql>): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Reads typed rows from a raw executor without fighting drizzle's variance. */
async function rows<T>(db: RawExecutor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

/**
 * The SQLSTATE a failing raw query carries, or `null` if it did not fail.
 *
 * The raw executor does not map driver errors (only `withMappedErrors` does),
 * so drizzle wraps the pg error and the SQLSTATE lives on `.cause.code`. This
 * digs it out rather than asserting on a wrapped message that could change.
 */
async function sqlStateOf(work: () => Promise<unknown>): Promise<string | null> {
  try {
    await work();
    return null;
  } catch (error: unknown) {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
        return code;
      }
      current = (current as { cause?: unknown }).cause;
    }
    return null;
  }
}

/** Restore targets. Deterministic per worker process, like the disposable names. */
const TARGET_A = `embroidery_db10_restore_a_${process.pid}`.slice(0, 63);
const TARGET_B = `embroidery_db10_restore_b_${process.pid}`.slice(0, 63);

/**
 * Tables whose *content*, not just row count, is checksummed across the
 * restore. Chosen because each is a class the durability matrix marks
 * critical and each has a different storage shape — money numerics, an
 * immutable snapshot, an append-only evidence chain, a JSONB payload.
 */
const CHECKSUM_TABLES = [
  'orders',
  'order_items',
  'payment_obligations',
  'approval_snapshots',
  'audit_events',
  'outbox_events',
  'inventory_ledger_entries',
] as const;

describe('DB10-CP2 logical backup and restore rehearsal', () => {
  let bench: BenchContext;
  let workspace: BackupWorkspace;
  let manifestPath: string;
  let manifest: BackupManifest;
  let sourceChecksums: Record<string, string>;

  beforeAll(async () => {
    workspace = await createBackupWorkspace('cp2');
    bench = await createBenchContext('db10-cp2-source', [OrderModule], 'S');

    // `bench_uuid` is generation scaffolding, not schema. Left in place it
    // would travel inside the dump and the restored database would carry a
    // function the canonical baseline does not describe — which the
    // fingerprint gate would (correctly) reject. Dropping it here keeps the
    // rehearsal about the real schema.
    await bench.context.disposable.client.db.execute(
      sql`drop function if exists bench_uuid(text, bigint)`,
    );

    sourceChecksums = await checksumsOf(bench.context.disposable.client.db);
  }, 1_800_000);

  afterAll(async () => {
    // Every database this rehearsal created is removed, including the ones a
    // failing assertion may have left behind.
    for (const name of await databasesMatching(`embroidery_db10_restore_`)) {
      await dropDatabaseIfExists(name);
    }
    await workspace?.dispose();
    await bench?.close();
  }, 300_000);

  /** `<row count>:<md5 of every row's text form, order-independent>` per table. */
  async function checksumsOf(db: RawExecutor): Promise<Record<string, string>> {
    const checksums: Record<string, string> = {};
    for (const table of CHECKSUM_TABLES) {
      const [result] = await rows<{ digest: string | null; total: number }>(
        db,
        sql`
          select md5(string_agg(row_data, '|' order by row_data)) as digest,
                 count(*)::int as total
          from (select ${sql.identifier(table)}::text as row_data from ${sql.identifier(table)}) t
        `,
      );
      checksums[table] = `${result?.total ?? 0}:${result?.digest ?? 'empty'}`;
    }
    return checksums;
  }

  it('takes a backup whose manifest describes the source completely', async () => {
    const result = await runTool('db-backup.mjs', [
      '--database',
      bench.context.disposable.name,
      '--out',
      workspace.directory,
      '--label',
      'cp2',
      '--url',
      bench.context.disposable.url,
    ]);

    expect(result.status).toBe(0);
    manifestPath = manifestPathFor(workspace.directory, result.stdout);
    manifest = await readBackupManifest(manifestPath);

    expect(manifest.tableCount).toBe(78);
    expect(manifest.appliedMigrations).toBe(33);
    expect(manifest.postgresVersion).toMatch(/^16\./);
    expect(manifest.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.artifactBytes).toBeGreaterThan(0);
    expect(manifest.totalRows).toBeGreaterThan(0);

    // The source still matches the frozen baseline, so the artifact does too.
    expect(manifest.schemaFingerprint).toBe(
      '82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf',
    );

    // Exposure is declared, never inferred (DP-BAK-05).
    expect(manifest.encryption).toBe('none');
    expect(manifest.sanitization).toBe('none');

    // Nothing that looks like a credential reached the artifact metadata.
    const manifestText = await readFile(manifestPath, 'utf8');
    expect(manifestText).not.toContain('password');
    expect(manifestText).not.toContain('embroidery_dev_password');

    console.log(
      `[db10-cp2] backup ${manifest.backupId}: ${manifest.totalRows} rows, ` +
        `${manifest.artifactBytes} bytes, ${manifest.durationMs} ms`,
    );
  }, 600_000);

  it.each([
    ['restore_a', () => TARGET_A],
    ['restore_b', () => TARGET_B],
  ])(
    'restores into an independent empty database (%s)',
    async (_label, target) => {
      const started = Date.now();
      const result = await runTool('db-restore.mjs', [
        '--manifest',
        manifestPath,
        '--target',
        target(),
        '--create',
      ]);

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('row-count parity OK');
      expect(result.stdout).toContain('restore verified.');
      console.log(`[db10-cp2] ${target()} restored in ${Date.now() - started} ms (wall clock)`);
    },
    600_000,
  );

  it.each([
    ['restore_a', () => TARGET_A],
    ['restore_b', () => TARGET_B],
  ])(
    'reproduces the frozen DB6 physical baseline (%s)',
    async (_label, target) => {
      const outcome = await verifySchemaBaseline(urlForDatabase(target()));
      const failures = outcome.stages.filter((stage) => !stage.passed);
      expect(failures.map((stage) => `${stage.checker}: ${stage.summary}`)).toEqual([]);
      expect(outcome.passed).toBe(true);
    },
    600_000,
  );

  it.each([
    ['restore_a', () => TARGET_A],
    ['restore_b', () => TARGET_B],
  ])(
    'preserves critical row content byte for byte (%s)',
    async (_label, target) => {
      const actor = await attachActor(`cp2-checksum-${target()}`, [OrderModule], target());
      try {
        const restored = await checksumsOf(rawExecutor(actor));
        expect(restored).toEqual(sourceChecksums);
      } finally {
        await actor.close();
      }
    },
    600_000,
  );

  it('keeps constraints and S24 triggers enforcing after restore', async () => {
    const actor = await attachActor('cp2-guards', [OrderModule], TARGET_A);
    const db = rawExecutor(actor);
    try {
      // order_items is S24-immutable: any UPDATE is refused.
      expect(await sqlStateOf(() => db.execute(sql`update order_items set quantity = -1`))).toBe(
        '23000',
      );

      // audit_events is append-only, and the rejection still carries the S24
      // SQLSTATE 23000 rather than degrading to a generic error after the
      // restore.
      expect(await sqlStateOf(() => db.execute(sql`update audit_events set action = 'X'`))).toBe(
        '23000',
      );

      // And DELETE is still refused without the retention exemption.
      expect(await sqlStateOf(() => db.execute(sql`delete from audit_events`))).toBe('23000');
    } finally {
      await actor.close();
    }
  }, 600_000);

  it('serves restored rows through the real repositories', async () => {
    const actor = await attachActor('cp2-repository', [OrderModule], TARGET_A);
    try {
      const orders = actor.get<OrderRepository>(ORDER_REPOSITORY);
      const [row] = await rows<{ id: string }>(
        rawExecutor(actor),
        sql`select id from orders limit 1`,
      );
      expect(row?.id).toBeDefined();
      const orderId = row?.id;
      if (orderId === undefined) {
        throw new Error('restored database has no orders to read');
      }

      const order = await actor.inTransaction(() => orders.findById(orderId as OrderId));
      expect(order).not.toBeNull();
      expect(order?.id).toBe(orderId);
    } finally {
      await actor.close();
    }
  }, 600_000);

  it('still commits order and outbox event atomically on the restored database', async () => {
    const actor = await attachActor('cp2-atomicity', [OrderModule], TARGET_A);
    try {
      const orders = actor.get<OrderRepository>(ORDER_REPOSITORY);
      const outbox = actor.get<OutboxEventStore>(OutboxEventStore);
      const backbone = bench.dataset.backbone;

      const id = newId() as OrderId;
      const input: CreateOrderInput = {
        id,
        code: `ORD-DB10-${id}`,
        customRequestId: backbone.customRequestId,
        acceptedQuotationVersionId: backbone.quotationVersionId,
        approvalSnapshotId: backbone.approvalSnapshotId,
        items: [
          {
            position: 1,
            skuId: backbone.skuId,
            customerOwnedProductId: undefined,
            productName: 'Restored Tee',
            variantLabel: 'Black / M',
            sizeLabel: 'M',
            quantity: 25,
            unitPriceAmount: '100000.00',
            lineTotalAmount: '2500000.00',
          },
        ],
      };

      // Rollback half first, so the request is still order-free: create the
      // order, then throw. Atomicity means neither the order nor its outbox
      // row survives.
      const doomed = newId() as OrderId;
      await expect(
        actor.inTransaction(async () => {
          await orders.createFromAcceptedQuotation({
            ...input,
            id: doomed,
            code: `ORD-X-${doomed}`,
          });
          throw new Error('deliberate rollback');
        }),
      ).rejects.toThrow('deliberate rollback');

      const [survivors] = await rows<{ total: number }>(
        rawExecutor(actor),
        sql`select count(*)::int as total from orders where id = ${doomed}`,
      );
      expect(Number(survivors?.total)).toBe(0);
      expect(await outbox.listForAggregate('ORDER', doomed)).toHaveLength(0);

      // Commit half: the same request now takes a real order, and the
      // order.created event commits in the same transaction.
      await actor.inTransaction(() => orders.createFromAcceptedQuotation(input));

      const events = await outbox.listForAggregate('ORDER', id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ eventType: 'order.created', status: 'PENDING' });
    } finally {
      await actor.close();
    }
  }, 600_000);

  it('refuses a corrupted artifact before creating anything', async () => {
    const artifactPath = join(workspace.directory, manifest.artifact);
    const original = await readFile(artifactPath);
    const corrupted = Buffer.from(original);
    corrupted.write('CORRUPTED', 20_000, 'utf8');
    const scratchPath = join(workspace.directory, 'corrupted.dump');
    const scratchManifest = join(workspace.directory, 'corrupted.manifest.json');
    await writeFile(scratchPath, corrupted);
    await writeFile(
      scratchManifest,
      JSON.stringify({ ...manifest, artifact: 'corrupted.dump' }, null, 2),
    );

    const target = `${TARGET_A}_corrupt`.slice(0, 63);
    const result = await runTool('db-restore.mjs', [
      '--manifest',
      scratchManifest,
      '--target',
      target,
      '--create',
    ]);

    expect(result.status).toBe(4);
    expect(result.stderr).toContain('artifact hash mismatch');
    expect(result.stderr).not.toContain('password');

    // Nothing was created: the tool refused before touching the server.
    const exists = await bench.context.disposable.client.db.execute<{ total: number }>(
      sql`select count(*)::int as total from pg_database where datname = ${target}`,
    );
    expect(Number(exists.rows[0]?.total)).toBe(0);
  }, 600_000);

  it('refuses to restore over a database that already exists', async () => {
    const result = await runTool('db-restore.mjs', [
      '--manifest',
      manifestPath,
      '--target',
      TARGET_A,
      '--create',
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already exists; refusing to replace it');
  }, 600_000);

  it('supports a schema-only restore for selective recovery', async () => {
    const target = `${TARGET_A}_schema`.slice(0, 63);
    try {
      const result = await runTool('db-restore.mjs', [
        '--manifest',
        manifestPath,
        '--target',
        target,
        '--create',
        '--schema-only',
      ]);
      expect(result.status).toBe(0);

      const outcome = await verifySchemaBaseline(urlForDatabase(target));
      expect(outcome.passed).toBe(true);

      const counts = await bench.context.disposable.client.db.execute<{ total: number }>(sql`
        select count(*)::int as total
        from pg_database where datname = ${target}
      `);
      expect(Number(counts.rows[0]?.total)).toBe(1);
    } finally {
      await dropDatabaseIfExists(target);
    }
  }, 600_000);

  /** Raw SQL against an attached actor, through its injected connection. */
  function rawExecutor(actor: AttachedActor): RawExecutor {
    return actor.get<{ database: RawExecutor }>(DATABASE_CONNECTION).database;
  }
});
