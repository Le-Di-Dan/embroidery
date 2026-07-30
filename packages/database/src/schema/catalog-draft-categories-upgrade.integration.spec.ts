/**
 * APP2-B02-G01 — the upgrade path, run as an upgrade rather than described.
 *
 * A fresh install proves the end state; it cannot prove what happens to a
 * database that already holds categories. This suite builds the real
 * pre-APP2-B02-G01 baseline — migrations 0000-0032 only — and then applies 0033
 * to three databases that differ only in what `categories` already contained:
 *
 *   empty        -> all four rows are inserted;
 *   canonical    -> the existing row is preserved and never duplicated;
 *   conflicting  -> the migration fails loudly instead of overwriting.
 *
 * The baseline is the committed migration files minus 0033, copied to a temp
 * folder with a trimmed journal, so the SQL under test is byte-identical to
 * what is committed and the migrator's own hashes still match.
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
import { APP2_CATEGORY_STATUS, APP2_CATEGORY_TAXONOMY } from './catalog/categories';

const NEW_MIGRATION_TAG = '0033_provision_catalog_draft_categories';
const BASELINE_MIGRATION_COUNT = 33;

interface CategoryRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly display_order: number;
  readonly status: string;
  readonly is_indexable: boolean;
}

/** The canonical row this suite pre-seeds in the "already present" case. */
const PRESEEDED = APP2_CATEGORY_TAXONOMY[1] as (typeof APP2_CATEGORY_TAXONOMY)[number];

describe('catalog draft categories upgrade path (integration)', () => {
  let baseUrl: string;
  let baselineFolder: string;
  const created: string[] = [];

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

  function configFor(target: string) {
    return loadDatabaseConfig({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: target,
      DATABASE_SSL_MODE: 'disable',
    });
  }

  /** Copies the committed migrations, minus 0033, into a temporary folder. */
  async function buildBaselineFolder(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), 'app2b02g01-baseline-'));
    await cp(migrationsFolder(), folder, { recursive: true });
    await rm(join(folder, `${NEW_MIGRATION_TAG}.sql`));

    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    journal.entries = journal.entries.filter((entry) => entry.tag !== NEW_MIGRATION_TAG);
    await writeFile(journalPath, JSON.stringify(journal, null, 2));
    return folder;
  }

  /** Creates a database at the 32-migration baseline and returns a client. */
  async function baselineDatabase(label: string): Promise<{ url: string; client: DatabaseClient }> {
    const name = disposableDatabaseName(label);
    created.push(name);
    await maintenance(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await maintenance(`CREATE DATABASE ${name}`);
    const url = urlFor(name);
    await runMigrations(configFor(url), baselineFolder);
    return { url, client: createDatabaseClient(configFor(url)) };
  }

  async function readCategories(client: DatabaseClient): Promise<CategoryRow[]> {
    const { rows } = await client.db.execute(
      sql`select id, name, slug, display_order, status, is_indexable
            from categories order by display_order`,
    );
    return rows as unknown as CategoryRow[];
  }

  beforeAll(async () => {
    baseUrl = resolveDatabaseUrl();
    baselineFolder = await buildBaselineFolder();
  }, 240_000);

  // Four databases are dropped here. Under the full `pnpm quality` run every
  // package's integration suite competes for the same PostgreSQL server, and
  // the default 120s hook budget is not enough for the teardown alone — so it
  // gets the same explicit budget as the setup rather than failing a suite
  // whose assertions all passed.
  afterAll(async () => {
    for (const name of created) {
      await maintenance(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
    }
    if (baselineFolder !== undefined) {
      await rm(baselineFolder, { recursive: true, force: true });
    }
  }, 240_000);

  it('starts from a real 32-migration baseline with no categories', async () => {
    const { client } = await baselineDatabase('app2b02g01-baseline-probe');
    try {
      const { rows } = await client.db.execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      expect((rows[0] as { n: number }).n).toBe(BASELINE_MIGRATION_COUNT - 1);
      expect(await readCategories(client)).toEqual([]);
    } finally {
      await client.close();
    }
  }, 240_000);

  it('inserts all four rows when categories is empty', async () => {
    const { url, client } = await baselineDatabase('app2b02g01-empty');
    try {
      await runMigrations(configFor(url), migrationsFolder());

      const { rows } = await client.db.execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      expect((rows[0] as { n: number }).n).toBe(BASELINE_MIGRATION_COUNT);

      const categories = await readCategories(client);
      expect(categories.map((row) => [row.slug, row.name, row.display_order])).toEqual(
        APP2_CATEGORY_TAXONOMY.map((c) => [c.slug, c.name, c.displayOrder]),
      );
      expect(categories.map((row) => row.id)).toEqual(APP2_CATEGORY_TAXONOMY.map((c) => c.id));
    } finally {
      await client.close();
    }
  }, 240_000);

  it('preserves an already-canonical row and creates no duplicate', async () => {
    const { url, client } = await baselineDatabase('app2b02g01-preseeded');
    try {
      await client.db.execute(sql`
        insert into categories (id, name, slug, display_order, status, is_indexable)
        values (${PRESEEDED.id}::uuid, ${PRESEEDED.name}, ${PRESEEDED.slug},
                ${PRESEEDED.displayOrder}, ${APP2_CATEGORY_STATUS}, true)
      `);
      const before = await readCategories(client);
      expect(before).toHaveLength(1);

      await runMigrations(configFor(url), migrationsFolder());

      const after = await readCategories(client);
      expect(after).toHaveLength(APP2_CATEGORY_TAXONOMY.length);
      expect(after.filter((row) => row.slug === PRESEEDED.slug)).toHaveLength(1);
      // Byte-identical: the migration accepted it rather than rewriting it.
      expect(after.find((row) => row.slug === PRESEEDED.slug)).toEqual(before[0]);
    } finally {
      await client.close();
    }
  }, 240_000);

  it('fails loudly on a conflicting row rather than overwriting operator data', async () => {
    const { url, client } = await baselineDatabase('app2b02g01-conflict');
    try {
      const foreignId = newId();
      await client.db.execute(sql`
        insert into categories (id, name, slug, display_order, status, is_indexable)
        values (${foreignId}::uuid, ${'Danh mục của cửa hàng'}, ${PRESEEDED.slug},
                ${77}, 'DRAFT', false)
      `);

      await expect(runMigrations(configFor(url), migrationsFolder())).rejects.toThrow(
        /APP2-B02-G01/,
      );

      // The conflicting row is untouched and the migration did not record.
      const rows = await readCategories(client);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        id: foreignId,
        name: 'Danh mục của cửa hàng',
        slug: PRESEEDED.slug,
        display_order: 77,
        status: 'DRAFT',
        is_indexable: false,
      });

      const { rows: applied } = await client.db.execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      expect((applied[0] as { n: number }).n).toBe(BASELINE_MIGRATION_COUNT - 1);
    } finally {
      await client.close();
    }
  }, 240_000);
});
