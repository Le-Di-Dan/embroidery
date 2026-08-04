/**
 * APP3-DB01 — the upgrade path, run as an upgrade rather than described as one.
 *
 * A fresh install proves the end state; it cannot prove that a database with
 * existing placement rows survives `code` becoming NOT NULL. This suite builds
 * the real pre-APP3-DB01 baseline — migrations 0000-0033 only — seeds Product
 * Sides and Embroidery Areas that have no code because the column does not yet
 * exist, and only afterwards applies 0034 from the committed migrations folder.
 *
 * The baseline is produced by copying the committed migration files into a
 * temporary folder with a trimmed journal, so the SQL under test is
 * byte-identical to what is committed: a re-authored baseline would prove only
 * that the copy is self-consistent.
 *
 * Determinism matters more than it looks. The backfill derives `code` from the
 * row's own immutable id, so a rebuild of the same database produces the same
 * codes — which is what makes a legacy code safe to reference at all.
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

const NEW_MIGRATION_TAG = '0034_add_app3_placement_and_derivative_authority';
const POST_BASELINE_TAGS = [NEW_MIGRATION_TAG] as const;

const BASELINE_MIGRATION_COUNT = 33;
const FULL_MIGRATION_COUNT = 34;

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

interface PlacementRow {
  readonly id: string;
  readonly code: string;
}

describe('APP3 placement upgrade path (integration)', () => {
  const name = disposableDatabaseName('app3db01-upgrade');
  let baseUrl: string;
  let url: string;
  let baselineFolder: string;
  let client: DatabaseClient | undefined;

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
    const folder = await mkdtemp(join(tmpdir(), 'app3db01-baseline-'));
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

  beforeAll(async () => {
    baseUrl = resolveDatabaseUrl();
    url = urlFor(name);
    baselineFolder = await buildBaselineFolder();

    await maintenance(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await maintenance(`CREATE DATABASE ${name}`);
    await runMigrations(configFor(url), baselineFolder);
    client = createDatabaseClient(configFor(url));
  }, 240_000);

  afterAll(async () => {
    await client?.close();
    await maintenance(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
    if (baselineFolder !== undefined) {
      await rm(baselineFolder, { recursive: true, force: true });
    }
  });

  const db = (): DatabaseClient['db'] => {
    if (client === undefined) {
      throw new Error('The upgrade harness did not finish setting up.');
    }
    return client.db;
  };

  let sideIds: string[];
  let areaIds: string[];

  it('starts from the real pre-APP3-DB01 baseline', async () => {
    const { rows } = await db().execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    expect((rows[0] as { n: number }).n).toBe(BASELINE_MIGRATION_COUNT);

    const { rows: columns } = await db().execute(sql`
      select column_name from information_schema.columns
       where table_name in ('product_sides', 'embroidery_areas', 'asset_derivatives')
         and column_name in ('code', 'retired_at', 'superseded_by_id', 'width_px')
    `);
    expect(columns).toHaveLength(0);
  });

  it('seeds placement rows that predate the code column', async () => {
    const categoryId = newId();
    const productId = newId();
    await db().execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${categoryId}, 'Upgrade', ${`cat-${categoryId}`}, 1, 'PUBLISHED', true)
    `);
    await db().execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Upgrade product', ${`p-${productId}`}, 100000, 'VND',
              'PUBLISHED', false, 1, true)
    `);

    sideIds = [];
    areaIds = [];
    // Two sides sharing one display name: a name-derived code would collide
    // here, which is exactly why the backfill uses the row id.
    for (const label of ['Front', 'Front']) {
      const assetId = newId();
      const sideId = newId();
      await db().execute(sql`
        insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
        values (${assetId}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
                ${`upgrade/${assetId}/original.png`}, 'image/png', 4096, ${CHECKSUM}, 'ACCEPTED')
      `);
      await db().execute(sql`
        insert into product_sides (id, product_id, name, background_asset_id, image_width_px,
                                   image_height_px, physical_width_mm, physical_height_mm,
                                   px_per_mm, display_order)
        values (${sideId}, ${productId}, ${label}, ${assetId}, 1000, 1000, 200, 200, 5, 1)
      `);
      sideIds.push(sideId);

      const areaId = newId();
      await db().execute(sql`
        insert into embroidery_areas (id, product_side_id, name, bound_x_px, bound_y_px,
                                      bound_width_px, bound_height_px, display_order)
        values (${areaId}, ${sideId}, 'Chest', 10, 10, 100, 100, 1)
      `);
      areaIds.push(areaId);
    }

    const { rows } = await db().execute(sql`select count(*)::int as n from product_sides`);
    expect((rows[0] as { n: number }).n).toBe(2);
  });

  it('applies 0034 and backfills a deterministic legacy code for every row', async () => {
    await runMigrations(configFor(url), migrationsFolder());

    const { rows: applied } = await db().execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    expect((applied[0] as { n: number }).n).toBe(FULL_MIGRATION_COUNT);

    const { rows: sides } = await db().execute(sql`select id, code from product_sides order by id`);
    const { rows: areas } = await db().execute(
      sql`select id, code from embroidery_areas order by id`,
    );

    for (const row of [...sides, ...areas] as unknown as PlacementRow[]) {
      expect(row.code).toBe(`legacy-${row.id.replaceAll('-', '')}`);
      expect(row.code).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/);
    }
    expect(sides).toHaveLength(2);
    expect(areas).toHaveLength(2);
  });

  it('produced distinct codes despite the shared display name', async () => {
    const { rows } = await db().execute(sql`
      select count(distinct code)::int as distinct_codes, count(*)::int as total from product_sides
    `);
    const row = rows[0] as { distinct_codes: number; total: number };
    expect(row.distinct_codes).toBe(row.total);
  });

  it('is repeatable: recomputing the backfill expression changes nothing', async () => {
    // The expression is a pure function of the row id, so re-running it must be
    // a no-op. If it were not, "deterministic" would only mean "ran once".
    const { rows } = await db().execute(sql`
      select count(*)::int as n from product_sides
       where code is distinct from 'legacy-' || replace(id::text, '-', '')
    `);
    expect((rows[0] as { n: number }).n).toBe(0);

    const { rows: areas } = await db().execute(sql`
      select count(*)::int as n from embroidery_areas
       where code is distinct from 'legacy-' || replace(id::text, '-', '')
    `);
    expect((areas[0] as { n: number }).n).toBe(0);
  });

  it('left the upgraded rows fully constrained', async () => {
    const { rows } = await db().execute(sql`
      select is_nullable from information_schema.columns
       where table_name = 'product_sides' and column_name = 'code'
    `);
    expect((rows[0] as { is_nullable: string }).is_nullable).toBe('NO');

    const { rows: constraints } = await db().execute(sql`
      select conname from pg_constraint
       where conrelid = 'product_sides'::regclass
         and conname in ('uq_product_sides__product_code', 'ck_product_sides__code_format')
       order by conname
    `);
    expect(constraints).toHaveLength(2);
  });

  it('left historical derivatives untouched and unmeasured', async () => {
    const { rows } = await db().execute(sql`
      select count(*)::int as n from asset_derivatives
       where num_nonnulls(width_px, height_px, media_type, byte_size) <> 0
    `);
    expect((rows[0] as { n: number }).n).toBe(0);
  });
});
