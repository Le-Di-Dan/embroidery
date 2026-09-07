/**
 * `APP12-M01.DB1` — the 0038 → 0039 upgrade, run as an upgrade rather than
 * described as one.
 *
 * A fresh install proves the end state. It cannot prove that a database already
 * holding real Product media survives a migration that replaces the table's
 * uniqueness key and installs two CHECKs over rows written years before them.
 * This suite builds the real pre-`APP12-M01.DB1` baseline — migrations
 * 0000–0038 only — seeds a full 20-image gallery while the new constraints do
 * not yet exist, and only afterwards applies 0039 from the committed migrations
 * folder.
 *
 * The baseline is produced by copying the committed migration files into a
 * temporary folder with a trimmed journal, so the SQL under test is
 * byte-identical to what is committed: a re-authored baseline would prove only
 * that the copy is self-consistent.
 *
 * What must hold afterwards: not one media row lost, reordered, re-roled or
 * re-pointed at a different Asset; the four constraints live on data that
 * predates them; and the migration refuses rather than repairs when the corpus
 * violates them — proved by running the same upgrade against a second baseline
 * seeded with a duplicate position.
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
import { disposableDatabaseName, migrationsFolder, resolveDatabaseUrl } from '../testing/index';
import { MAX_PRODUCT_MEDIA_ITEMS, PRODUCT_MEDIA_PRIMARY_ROLE } from './catalog/product-media';
import { insertProductMedia, seedProductMediaSubject } from './app12-product-media-fixture';
import type { ProductMediaSubject } from './app12-product-media-fixture';

const NEW_MIGRATION_TAG = '0039_add_app12_product_media_invariants';
const POST_BASELINE_TAGS = [NEW_MIGRATION_TAG] as const;

const BASELINE_MIGRATION_COUNT = 38;
const FULL_MIGRATION_COUNT = 39;

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

const GALLERY = 'GALLERY';

/** The four columns an upgrade may not disturb, row for row. */
type MediaRow = {
  readonly id: string;
  readonly asset_id: string;
  readonly role: string;
  readonly display_order: number;
};

describe('APP12 product-media upgrade path (integration)', () => {
  const name = disposableDatabaseName('app12m01db1-upgrade');
  const violatingName = disposableDatabaseName('app12m01db1-upgrade-violating');
  let baseUrl: string;
  let url: string;
  let baselineFolder: string;
  let client: DatabaseClient | undefined;
  let subject: ProductMediaSubject;
  let before: MediaRow[];

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

  async function buildBaselineFolder(): Promise<string> {
    const source = migrationsFolder();
    const folder = await mkdtemp(join(tmpdir(), 'app12m01db1-baseline-'));
    await cp(source, folder, { recursive: true });
    for (const tag of POST_BASELINE_TAGS) {
      await rm(join(folder, `${tag}.sql`));
    }

    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    journal.entries = journal.entries.filter(
      (entry) => !POST_BASELINE_TAGS.includes(entry.tag as (typeof POST_BASELINE_TAGS)[number]),
    );
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

  async function constraintExists(conname: string): Promise<boolean> {
    const { rows } = await client!.db.execute<{ n: string }>(sql`
      select count(*)::text as n from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'product_media' and c.conname = ${conname}
    `);
    return rows[0]?.n === '1';
  }

  async function appliedMigrationCount(): Promise<number> {
    const { rows } = await client!.db.execute<{ n: string }>(
      sql`select count(*)::text as n from drizzle.__drizzle_migrations`,
    );
    return Number(rows[0]?.n ?? '0');
  }

  async function mediaRows(): Promise<MediaRow[]> {
    const { rows } = await client!.db.execute<MediaRow>(sql`
      select id, asset_id, role, display_order from product_media
      where product_id = ${subject.productId} order by display_order
    `);
    return rows.map((row) => ({ ...row, display_order: Number(row.display_order) }));
  }

  beforeAll(async () => {
    baseUrl = resolveDatabaseUrl();
    url = urlFor(name);
    await maintenance(`CREATE DATABASE "${name}"`);
    baselineFolder = await buildBaselineFolder();

    // Baseline: everything up to and including 0038, and nothing after.
    await runMigrations(configFor(url), baselineFolder);
    client = createDatabaseClient(configFor(url));

    subject = await seedProductMediaSubject(client.db, MAX_PRODUCT_MEDIA_ITEMS);
    await insertProductMedia(client.db, {
      productId: subject.productId,
      assetId: subject.assetIds[0] as string,
      role: PRODUCT_MEDIA_PRIMARY_ROLE,
      displayOrder: 0,
    });
    for (let position = 1; position < MAX_PRODUCT_MEDIA_ITEMS; position += 1) {
      await insertProductMedia(client.db, {
        productId: subject.productId,
        assetId: subject.assetIds[position] as string,
        role: GALLERY,
        displayOrder: position,
      });
    }
    before = await mediaRows();
  }, 300_000);

  afterAll(async () => {
    await client?.close();
    if (baseUrl !== undefined) {
      await maintenance(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await maintenance(`DROP DATABASE IF EXISTS "${violatingName}" WITH (FORCE)`);
    }
    if (baselineFolder !== undefined) {
      await rm(baselineFolder, { recursive: true, force: true });
    }
  });

  it('starts from the 0038 baseline, before the invariants exist', async () => {
    expect(await appliedMigrationCount()).toBe(BASELINE_MIGRATION_COUNT);
    expect(await constraintExists('uq_product_media__product_asset_role')).toBe(true);
    expect(await constraintExists('uq_product_media__product_display_order')).toBe(false);
    expect(await constraintExists('ck_product_media__display_order_bounded')).toBe(false);
    expect(before).toHaveLength(MAX_PRODUCT_MEDIA_ITEMS);
  });

  describe('after applying 0039', () => {
    beforeAll(async () => {
      await runMigrations(configFor(url), migrationsFolder());
    }, 300_000);

    it('applied exactly one further migration', async () => {
      expect(await appliedMigrationCount()).toBe(FULL_MIGRATION_COUNT);
    });

    it('installed the four invariant constraints and retired the role-keyed one', async () => {
      expect(await constraintExists('uq_product_media__product_asset')).toBe(true);
      expect(await constraintExists('uq_product_media__product_display_order')).toBe(true);
      expect(await constraintExists('ck_product_media__display_order_bounded')).toBe(true);
      expect(await constraintExists('ck_product_media__primary_role_at_zero')).toBe(true);
      expect(await constraintExists('uq_product_media__product_asset_role')).toBe(false);
    });

    it('left every existing media row exactly as it was', async () => {
      // Identity, asset, role and position, row for row — not a count, which
      // would pass on a migration that rewrote every position to 0..N-1.
      expect(await mediaRows()).toEqual(before);
    });

    it('added and removed no media row at all', async () => {
      const { rows } = await client!.db.execute<{ n: string }>(
        sql`select count(*)::text as n from product_media`,
      );
      expect(Number(rows[0]?.n)).toBe(MAX_PRODUCT_MEDIA_ITEMS);
    });

    it('added no table — the schema keeps the same table count', async () => {
      const { rows } = await client!.db.execute<{ n: string }>(sql`
        select count(*)::text as n from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
      `);
      expect(Number(rows[0]?.n)).toBe(79);
    });

    it('enforces the position bound on data that predates the constraint', async () => {
      let code = 'no-error';
      try {
        await client!.db.execute(sql`
          update product_media set display_order = ${MAX_PRODUCT_MEDIA_ITEMS}
          where product_id = ${subject.productId} and display_order = 1
        `);
      } catch (error: unknown) {
        code = driverErrorCode(error) ?? 'no-driver-code';
      }
      expect(code).toBe(CHECK_VIOLATION);
      expect(await mediaRows()).toEqual(before);
    });

    it('enforces one row per position on data that predates the constraint', async () => {
      let code = 'no-error';
      try {
        await client!.db.execute(sql`
          update product_media set display_order = 2
          where product_id = ${subject.productId} and display_order = 1
        `);
      } catch (error: unknown) {
        code = driverErrorCode(error) ?? 'no-driver-code';
      }
      expect(code).toBe(UNIQUE_VIOLATION);
      expect(await mediaRows()).toEqual(before);
    });
  });

  describe('when the corpus violates an invariant', () => {
    it('fails the migration rather than repairing the rows', async () => {
      // The precheck is the difference between an upgrade that stops and one
      // that silently rewrites catalog evidence. Proved by building a second
      // baseline whose data is deliberately bad.
      const violatingUrl = urlFor(violatingName);
      await maintenance(`CREATE DATABASE "${violatingName}"`);
      await runMigrations(configFor(violatingUrl), baselineFolder);

      const bad = createDatabaseClient(configFor(violatingUrl));
      try {
        const target = await seedProductMediaSubject(bad.db, 2);
        // Two rows at position 0 — legal under 0038's role-keyed uniqueness,
        // rejected by 0039.
        await insertProductMedia(bad.db, {
          productId: target.productId,
          assetId: target.assetIds[0] as string,
          role: PRODUCT_MEDIA_PRIMARY_ROLE,
          displayOrder: 0,
        });
        await insertProductMedia(bad.db, {
          productId: target.productId,
          assetId: target.assetIds[1] as string,
          role: GALLERY,
          displayOrder: 0,
        });

        await expect(runMigrations(configFor(violatingUrl), migrationsFolder())).rejects.toThrow();

        // Nothing repaired, nothing dropped: the table is exactly as it was.
        const { rows } = await bad.db.execute<{ n: string }>(
          sql`select count(*)::text as n from product_media where product_id = ${target.productId}`,
        );
        expect(Number(rows[0]?.n)).toBe(2);
      } finally {
        await bad.close();
      }
    }, 300_000);
  });
});
