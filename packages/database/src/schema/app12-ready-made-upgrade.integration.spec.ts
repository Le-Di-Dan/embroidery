/**
 * APP12-DB01 — the 0037 → 0038 upgrade, run as an upgrade rather than described
 * as one.
 *
 * A fresh install proves the end state. It cannot prove that a database already
 * holding real custom orders survives a migration that drops four `NOT NULL`
 * constraints, replaces five CHECKs and backfills a new discriminator across
 * every existing row. This suite builds the real pre-APP12-DB01 baseline —
 * migrations 0000–0037 only — seeds a complete custom chain (order, item,
 * DEPOSIT obligation, REQUEST_ACCESS grant, no-expiry official reservation)
 * while `orders.origin` does not yet exist, and only afterwards applies 0038
 * from the committed migrations folder.
 *
 * The baseline is produced by copying the committed migration files into a
 * temporary folder with a trimmed journal, so the SQL under test is
 * byte-identical to what is committed: a re-authored baseline would prove only
 * that the copy is self-consistent.
 *
 * What must hold afterwards: every existing order is CUSTOM and no other; not
 * one custom link, obligation kind, grant scope or reservation expiry was
 * rewritten; and the constraints the migration installs are live on data that
 * predates them.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { Client } from 'pg';

import { createDatabaseClient } from '../client/create-database-client';
import type { DatabaseClient } from '../client/create-database-client';
import { loadDatabaseConfig } from '../config/database-config';
import { driverErrorCode } from '../errors/driver-error';
import { runMigrations } from '../migrations/run-migrations';
import { newId } from '../primitives/identifiers';
import { disposableDatabaseName, migrationsFolder, resolveDatabaseUrl } from '../testing/index';
import { seedPaymentAttemptChain } from './app7-transfer-evidence-fixture';
import type { PaymentAttemptChain } from './app7-transfer-evidence-fixture';
import { seedReadyMadeSubject } from './app12-ready-made-fixture';
import type { ReadyMadeSubject } from './app12-ready-made-fixture';

const NEW_MIGRATION_TAG = '0038_add_app12_ready_made_persistence';
const POST_BASELINE_TAGS = [NEW_MIGRATION_TAG] as const;

/**
 * Migrations committed after the one under test.
 *
 * They are stripped from *both* folders: from the baseline because the baseline
 * is the chain as it stood before 0038, and from the target because this suite
 * asserts that applying it adds exactly one migration. A later migration left
 * in the target folder would be applied alongside 0038 and the assertion would
 * be measuring two changes at once.
 */
const TRAILING_TAGS = ['0039_add_app12_product_media_invariants'] as const;

const BASELINE_MIGRATION_COUNT = 37;
const FULL_MIGRATION_COUNT = 38;

const CHECK_VIOLATION = '23514';

describe('APP12 Ready-Made upgrade path (integration)', () => {
  const name = disposableDatabaseName('app12db01-upgrade');
  let baseUrl: string;
  let url: string;
  let baselineFolder: string;
  let targetFolder: string;
  let client: DatabaseClient | undefined;
  let chain: PaymentAttemptChain;
  let subject: ReadyMadeSubject;
  let orderItemId: string;
  let reservationId: string;

  function urlFor(database: string): string {
    const parsed = new URL(baseUrl);
    parsed.pathname = `/${database}`;
    return parsed.toString();
  }

  async function maintenance(statement: string): Promise<void> {
    const admin = new Client({ connectionString: urlFor('postgres') });
    await admin.connect();
    try {
      await admin.query(statement);
    } finally {
      await admin.end();
    }
  }

  async function buildFolder(label: string, excluded: readonly string[]): Promise<string> {
    const source = migrationsFolder();
    const folder = await mkdtemp(join(tmpdir(), `app12db01-${label}-`));
    await cp(source, folder, { recursive: true });
    for (const tag of excluded) {
      await rm(join(folder, `${tag}.sql`));
    }

    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    journal.entries = journal.entries.filter((entry) => !excluded.includes(entry.tag));
    await writeFile(journalPath, JSON.stringify(journal, null, 2));
    return folder;
  }

  function configFor(target: string) {
    return loadDatabaseConfig({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: target,
      DATABASE_SSL_MODE: 'disable',
    });
  }

  async function columnExists(table: string, column: string): Promise<boolean> {
    const { rows } = await client!.db.execute<{ n: string }>(sql`
      select count(*)::text as n from information_schema.columns
      where table_schema = 'public' and table_name = ${table} and column_name = ${column}
    `);
    return rows[0]?.n === '1';
  }

  async function appliedMigrationCount(): Promise<number> {
    const { rows } = await client!.db.execute<{ n: string }>(
      sql`select count(*)::text as n from drizzle.__drizzle_migrations`,
    );
    return Number(rows[0]?.n ?? '0');
  }

  beforeAll(async () => {
    baseUrl = resolveDatabaseUrl();
    url = urlFor(name);
    await maintenance(`CREATE DATABASE "${name}"`);
    baselineFolder = await buildFolder('baseline', [...POST_BASELINE_TAGS, ...TRAILING_TAGS]);
    targetFolder = await buildFolder('target', TRAILING_TAGS);

    // Baseline: everything up to and including 0037, and nothing after.
    await runMigrations(configFor(url), baselineFolder);
    client = createDatabaseClient(configFor(url));

    chain = await seedPaymentAttemptChain(client.db);
    subject = await seedReadyMadeSubject(client.db, chain.productVariantId);

    orderItemId = newId();
    await client.db.execute(sql`
      insert into order_items
        (id, order_id, position, sku_id, product_name, quantity,
         unit_price_amount, line_total_amount, currency_code, approval_snapshot_id)
      values (${orderItemId}, ${chain.orderId}, 1, ${subject.skuId}, 'Tee', 2,
              150000.00, 300000.00, 'VND', ${chain.approvalSnapshotId})
    `);

    // A CUSTOM official reservation, no-expiry under PO-APP8-002.
    reservationId = newId();
    await client.db.execute(sql`
      insert into inventory_reservations
        (id, sku_stock_id, order_id, quantity, status)
      values (${reservationId}, ${subject.skuStockId}, ${chain.orderId}, 2, 'RESERVED')
    `);
  }, 300_000);

  afterAll(async () => {
    await client?.close();
    if (baseUrl !== undefined && name !== undefined) {
      await maintenance(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
    for (const folder of [baselineFolder, targetFolder]) {
      if (folder !== undefined) {
        await rm(folder, { recursive: true, force: true });
      }
    }
  });

  it('starts from the 0037 baseline, before the discriminator exists', async () => {
    expect(await appliedMigrationCount()).toBe(BASELINE_MIGRATION_COUNT);
    expect(await columnExists('orders', 'origin')).toBe(false);
    expect(await columnExists('secure_access_grants', 'order_id')).toBe(false);
  });

  describe('after applying 0038', () => {
    beforeAll(async () => {
      await runMigrations(configFor(url), targetFolder);
    }, 300_000);

    it('applied exactly one further migration', async () => {
      expect(await appliedMigrationCount()).toBe(FULL_MIGRATION_COUNT);
      expect(await columnExists('orders', 'origin')).toBe(true);
      expect(await columnExists('secure_access_grants', 'order_id')).toBe(true);
    });

    it('classified every pre-existing order as CUSTOM and none as READY_MADE', async () => {
      const { rows } = await client!.db.execute<{ origin: string; n: string }>(sql`
        select origin, count(*)::text as n from orders group by origin order by origin
      `);
      expect(rows).toEqual([{ origin: 'CUSTOM', n: '1' }]);
    });

    it('left the existing custom order chain byte-identical', async () => {
      const { rows } = await client!.db.execute<{
        custom_request_id: string;
        accepted_quotation_version_id: string;
        current_approval_snapshot_id: string;
        status: string;
      }>(sql`
        select custom_request_id, accepted_quotation_version_id,
               current_approval_snapshot_id, status
          from orders where id = ${chain.orderId}
      `);
      expect(rows[0]).toEqual({
        custom_request_id: chain.customRequestId,
        accepted_quotation_version_id: chain.quotationVersionId,
        current_approval_snapshot_id: chain.approvalSnapshotId,
        status: 'AWAITING_DEPOSIT',
      });
    });

    it('left the existing order item pointing at its approval snapshot', async () => {
      const { rows } = await client!.db.execute<{ approval_snapshot_id: string | null }>(sql`
        select approval_snapshot_id from order_items where id = ${orderItemId}
      `);
      expect(rows[0]?.approval_snapshot_id).toBe(chain.approvalSnapshotId);
    });

    it('changed no existing payment obligation kind or source', async () => {
      const { rows } = await client!.db.execute<{
        kind: string;
        source_quotation_version_id: string | null;
      }>(sql`
        select kind, source_quotation_version_id
          from payment_obligations where id = ${chain.paymentObligationId}
      `);
      expect(rows[0]).toEqual({
        kind: 'DEPOSIT',
        source_quotation_version_id: chain.quotationVersionId,
      });
    });

    it('reclassified no REQUEST_ACCESS grant and gave none an order', async () => {
      const { rows } = await client!.db.execute<{ n: string; orphaned: string }>(sql`
        select count(*)::text as n,
               count(*) filter (where order_id is not null)::text as orphaned
          from secure_access_grants where scope_kind = 'REQUEST_ACCESS'
      `);
      expect(rows[0]).toEqual({ n: '1', orphaned: '0' });
    });

    it('gave no existing custom reservation an expiry', async () => {
      const { rows } = await client!.db.execute<{ expires_at: string | null }>(sql`
        select expires_at from inventory_reservations where id = ${reservationId}
      `);
      expect(rows[0]?.expires_at).toBeNull();
    });

    it('installed the origin-aware chain constraint on data that predates it', async () => {
      let code = 'no-error';
      try {
        await client!.db.execute(sql`
          update orders set custom_request_id = null where id = ${chain.orderId}
        `);
      } catch (error: unknown) {
        code = driverErrorCode(error) ?? 'no-driver-code';
      }
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('accepts a Ready-Made order on the upgraded database', async () => {
      const id = newId();
      await client!.db.execute(sql`
        insert into orders
          (id, code, origin, customer_id, status, total_amount, currency_code)
        values (${id}, ${`ORD-${id}`}, 'READY_MADE', ${chain.customerId},
                'AWAITING_SHIPPING_FEE', 300000.00, 'VND')
      `);
      const { rows } = await client!.db.execute<{ origin: string }>(sql`
        select origin from orders where id = ${id}
      `);
      expect(rows[0]?.origin).toBe('READY_MADE');
    });
  });
});
