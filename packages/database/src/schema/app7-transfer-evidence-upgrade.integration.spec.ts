/**
 * APP7-DB01 — the 0036 → 0037 upgrade, run as an upgrade rather than described
 * as one.
 *
 * A fresh install proves the end state; it cannot prove that a database already
 * holding APP1–APP6 orders, payment attempts and assets survives the new table.
 * This suite builds the real pre-APP7-DB01 baseline — migrations 0000–0036 only
 * — seeds a complete payment chain and a customer-private asset while
 * `payment_transfer_evidence` does not yet exist, and only afterwards applies
 * 0037 from the committed migrations folder.
 *
 * The baseline is produced by copying the committed migration files into a
 * temporary folder with a trimmed journal, so the SQL under test is
 * byte-identical to what is committed: a re-authored baseline would prove only
 * that the copy is self-consistent.
 *
 * What must hold: the table does not exist before 0037 and does after; nothing
 * is backfilled, so it is empty on a database that already has payment attempts
 * and assets; no pre-existing row is rewritten; and the existing
 * `ck_approval_snapshots__preview_hash_format` constraint still carries its `$`
 * anchor — the migration's generation note removes a spurious drop/re-add pair
 * for it, and that trimming is checked rather than trusted.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { Client } from 'pg';

import { createDatabaseClient } from '../client/create-database-client';
import type { DatabaseClient } from '../client/create-database-client';
import { loadDatabaseConfig } from '../config/database-config';
import { runMigrations } from '../migrations/run-migrations';
import { newId } from '../primitives/identifiers';
import { disposableDatabaseName, migrationsFolder, resolveDatabaseUrl } from '../testing/index';
import { insertEvidenceAsset, seedPaymentAttemptChain } from './app7-transfer-evidence-fixture';
import type { PaymentAttemptChain } from './app7-transfer-evidence-fixture';

const NEW_MIGRATION_TAG = '0037_add_app7_transfer_evidence_association';
const POST_BASELINE_TAGS = [NEW_MIGRATION_TAG] as const;

/**
 * The migrations committed *after* this checkpoint's own.
 *
 * This suite proves one upgrade: the baseline, then `NEW_MIGRATION_TAG` and
 * nothing else. Applying `migrationsFolder()` unfiltered stopped meaning that
 * the moment a later migration landed — the count assertions and the
 * "nothing else changed" assertion would then be measuring someone else's
 * change. So the target folder is trimmed too, and each later migration is
 * added here as it ships.
 */
const TRAILING_TAGS = [
  '0038_add_app12_ready_made_persistence',
  '0039_add_app12_product_media_invariants',
] as const;

const BASELINE_MIGRATION_COUNT = 36;
const FULL_MIGRATION_COUNT = 37;

describe('APP7 transfer-evidence upgrade path (integration)', () => {
  const name = disposableDatabaseName('app7db01-upgrade');
  let baseUrl: string;
  let url: string;
  let baselineFolder: string;
  let targetFolder: string;
  let client: DatabaseClient | undefined;
  let chain: PaymentAttemptChain;
  let assetId: string;

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

  /** Copies the committed migrations, minus `excluded`, into a temp folder. */
  async function buildFolder(label: string, excluded: readonly string[]): Promise<string> {
    const source = migrationsFolder();
    const folder = await mkdtemp(join(tmpdir(), `app7db01-${label}-`));
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

  async function tableExists(table: string): Promise<boolean> {
    const { rows } = await client!.db.execute<{ n: string }>(sql`
      select count(*)::text as n from information_schema.tables
      where table_schema = 'public' and table_name = ${table}
    `);
    return rows[0]?.n === '1';
  }

  beforeAll(async () => {
    baseUrl = resolveDatabaseUrl();
    url = urlFor(name);
    await maintenance(`CREATE DATABASE "${name}"`);
    baselineFolder = await buildFolder('baseline', [...POST_BASELINE_TAGS, ...TRAILING_TAGS]);
    targetFolder = await buildFolder('target', TRAILING_TAGS);

    // Baseline: everything up to and including 0036, and nothing after.
    await runMigrations(configFor(url), baselineFolder);
    client = createDatabaseClient(configFor(url));

    chain = await seedPaymentAttemptChain(client.db);
    assetId = await insertEvidenceAsset(client.db);
  }, 300_000);

  afterAll(async () => {
    await client?.close();
    if (baselineFolder !== undefined) {
      await rm(baselineFolder, { recursive: true, force: true });
    }
    if (targetFolder !== undefined) {
      await rm(targetFolder, { recursive: true, force: true });
    }
    if (url !== undefined) {
      await maintenance(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
  });

  it('starts from the real 0036 baseline, without the new table', async () => {
    const { rows } = await client!.db.execute<{ n: string }>(
      sql`select count(*)::text as n from drizzle.__drizzle_migrations`,
    );
    expect(rows[0]?.n).toBe(String(BASELINE_MIGRATION_COUNT));
    expect(await tableExists('payment_transfer_evidence')).toBe(false);
  });

  it('applies 0037 over that baseline and creates the table', async () => {
    await runMigrations(configFor(url), targetFolder);

    const { rows } = await client!.db.execute<{ n: string }>(
      sql`select count(*)::text as n from drizzle.__drizzle_migrations`,
    );
    expect(rows[0]?.n).toBe(String(FULL_MIGRATION_COUNT));
    expect(await tableExists('payment_transfer_evidence')).toBe(true);
  });

  it('backfills nothing — the new table is empty on a database that already has attempts and assets', async () => {
    const { rows } = await client!.db.execute<{
      evidence: string;
      attempts: string;
      assets: string;
    }>(sql`
      select (select count(*)::text from payment_transfer_evidence) as evidence,
             (select count(*)::text from payment_attempts) as attempts,
             (select count(*)::text from assets) as assets
    `);
    expect(rows[0]?.evidence).toBe('0');
    expect(Number(rows[0]?.attempts)).toBeGreaterThan(0);
    expect(Number(rows[0]?.assets)).toBeGreaterThan(0);
  });

  it('leaves the pre-existing payment attempt and asset untouched', async () => {
    const { rows: attempt } = await client!.db.execute<{
      id: string;
      status: string;
      amount: string;
      method: string;
    }>(sql`
      select id, status, amount, method from payment_attempts where id = ${chain.paymentAttemptId}
    `);
    expect(attempt[0]).toEqual({
      id: chain.paymentAttemptId,
      status: 'PENDING',
      amount: '300000.00',
      method: 'BANK_TRANSFER',
    });

    const { rows: asset } = await client!.db.execute<{
      id: string;
      kind: string;
      classification: string;
      status: string;
    }>(sql`
      select id, kind, classification, status from assets where id = ${assetId}
    `);
    expect(asset[0]).toEqual({
      id: assetId,
      kind: 'CUSTOMER_UPLOAD',
      classification: 'CUSTOMER_PRIVATE',
      status: 'UPLOADED',
    });
  });

  it('binds that pre-existing attempt and asset once the table exists', async () => {
    await client!.db.execute(sql`
      insert into payment_transfer_evidence (id, payment_attempt_id, asset_id)
      values (${newId()}, ${chain.paymentAttemptId}, ${assetId})
    `);
    const { rows } = await client!.db.execute<{ n: string }>(sql`
      select count(*)::text as n from payment_transfer_evidence
      where payment_attempt_id = ${chain.paymentAttemptId} and asset_id = ${assetId}
    `);
    expect(rows[0]?.n).toBe('1');
  });

  it('keeps the approval-snapshot preview-hash CHECK intact, anchor and all', async () => {
    const { rows } = await client!.db.execute<{ def: string }>(sql`
      select pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      where con.conname = 'ck_approval_snapshots__preview_hash_format'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.def).toContain('{64}$');
  });

  it('changes nothing else in the physical catalog beyond the one new table', async () => {
    const { rows } = await client!.db.execute<{ tables: string; fks: string; uniques: string }>(sql`
      select (select count(*)::text from information_schema.tables
              where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
             (select count(*)::text from pg_constraint con
              join pg_class t on t.oid = con.conrelid
              join pg_namespace n on n.oid = t.relnamespace
              where n.nspname = 'public' and con.contype = 'f') as fks,
             (select count(*)::text from pg_constraint con
              join pg_class t on t.oid = con.conrelid
              join pg_namespace n on n.oid = t.relnamespace
              where n.nspname = 'public' and con.contype = 'u') as uniques
    `);
    expect(rows[0]).toEqual({ tables: '79', fks: '167', uniques: '53' });
  });
});
