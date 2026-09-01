/**
 * APP6-DB01 — the 0035 → 0036 upgrade, run as an upgrade rather than described
 * as one.
 *
 * A fresh install proves the end state; it cannot prove that a database already
 * holding APP1–APP5 design versions and approval snapshots survives four
 * dropped `NOT NULL`s, four new columns and three new CHECKs. This suite builds
 * the real pre-APP6-DB01 baseline — migrations 0000–0035 only — seeds complete
 * Catalog rows in both tables while the COP columns do not yet exist, and only
 * afterwards applies 0036 from the committed migrations folder.
 *
 * The baseline is produced by copying the committed migration files into a
 * temporary folder with a trimmed journal, so the SQL under test is
 * byte-identical to what is committed: a re-authored baseline would prove only
 * that the copy is self-consistent.
 *
 * What must hold: **no backfill**. Every historical row is already a complete
 * Catalog row, so it must satisfy its new branch CHECK untouched, and no COP
 * identity and no placement label may be invented for it — inventing one is the
 * exact failure ADR-APP6-001 exists to prevent, and a migration is a much
 * quieter place to commit it than an application is.
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

const NEW_MIGRATION_TAG = '0036_add_app6_cop_design_context';
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
  '0037_add_app7_transfer_evidence_association',
  '0038_add_app12_ready_made_persistence',
] as const;

const BASELINE_MIGRATION_COUNT = 35;
const FULL_MIGRATION_COUNT = 36;

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

/** The four columns whose `NOT NULL` this migration drops, on both tables. */
const CATALOG_PLACEMENT_COLUMNS = [
  'embroidery_area_id',
  'product_id',
  'product_side_id',
  'product_variant_id',
] as const;

describe('APP6 COP design context upgrade path (integration)', () => {
  const name = disposableDatabaseName('app6db01-upgrade');
  let baseUrl: string;
  let url: string;
  let baselineFolder: string;
  let targetFolder: string;
  let client: DatabaseClient | undefined;
  let historicalVersionId: string;
  let historicalSnapshotId: string;

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
    const folder = await mkdtemp(join(tmpdir(), `app6db01-${label}-`));
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

  const db = (): DatabaseClient['db'] => {
    if (client === undefined) {
      throw new Error('The upgrade database client was not initialised.');
    }
    return client.db;
  };

  /**
   * Seeds one complete Catalog design version and its approval snapshot,
   * against the pre-0036 schema where the placement quartet is still NOT NULL.
   */
  async function seedHistoricalCatalogRows(): Promise<void> {
    const customerId = newId();
    await db().execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Legacy customer', now())
    `);

    const customRequestId = newId();
    await db().execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'APPROVED')
    `);

    const designCaseId = newId();
    await db().execute(sql`
      insert into design_cases (id, custom_request_id) values (${designCaseId}, ${customRequestId})
    `);

    const categoryId = newId();
    await db().execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${categoryId}, 'Legacy', ${`cat-${categoryId}`}, 1, 'PUBLISHED', true)
    `);
    const productId = newId();
    await db().execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Legacy product', ${`p-${productId}`}, 100000, 'VND',
              'PUBLISHED', false, 1, true)
    `);
    const productVariantId = newId();
    await db().execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${productVariantId}, ${productId}, 'Navy', 'L', 1, true)
    `);
    const backgroundAssetId = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${backgroundAssetId}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
              ${`legacy/${backgroundAssetId}/original.png`}, 'image/png', 1024, ${CHECKSUM}, 'ACCEPTED')
    `);
    const productSideId = newId();
    await db().execute(sql`
      insert into product_sides (id, product_id, code, name, background_asset_id,
                                 image_width_px, image_height_px,
                                 physical_width_mm, physical_height_mm, px_per_mm, display_order)
      values (${productSideId}, ${productId}, ${`s-${productSideId.slice(0, 8)}`}, 'Front',
              ${backgroundAssetId}, 1000, 1000, 200, 200, 5, 1)
    `);
    const embroideryAreaId = newId();
    await db().execute(sql`
      insert into embroidery_areas (id, product_side_id, code, name,
                                    bound_x_px, bound_y_px, bound_width_px, bound_height_px,
                                    max_width_mm, max_height_mm, display_order)
      values (${embroideryAreaId}, ${productSideId}, ${`a-${embroideryAreaId.slice(0, 8)}`}, 'Chest',
              10, 10, 100, 100, 50, 50, 1)
    `);

    historicalVersionId = newId();
    await db().execute(sql`
      insert into design_versions (id, design_case_id, version, status, design_document,
                                   document_schema_version, document_hash,
                                   product_id, product_variant_id, product_side_id,
                                   embroidery_area_id, physical_width_mm, physical_height_mm,
                                   approved_at)
      values (${historicalVersionId}, ${designCaseId}, 1, 'APPROVED', '{}'::jsonb, 1, ${CHECKSUM},
              ${productId}, ${productVariantId}, ${productSideId}, ${embroideryAreaId},
              80, 60, now())
    `);

    const grantId = newId();
    await db().execute(sql`
      insert into secure_access_grants (id, customer_id, custom_request_id, token_hash,
                                        scope_kind, status, expires_at)
      values (${grantId}, ${customerId}, ${customRequestId}, ${`hash-${grantId}`},
              'REQUEST_ACCESS', 'ACTIVE', now() + interval '7 days')
    `);
    const challengeId = newId();
    await db().execute(sql`
      insert into contact_verification_challenges
             (id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
      values (${challengeId}, 'EMAIL', ${`c-${challengeId}@example.test`}, 'STEP_UP',
              ${`hash-${challengeId}`}, 'VERIFIED', now() + interval '30 minutes', now())
    `);

    historicalSnapshotId = newId();
    await db().execute(sql`
      insert into approval_snapshots (id, design_version_id, design_case_id, custom_request_id,
                                      customer_id, document_hash,
                                      product_id, product_variant_id, product_side_id,
                                      embroidery_area_id, product_name, variant_label,
                                      side_name, area_name, physical_width_mm, physical_height_mm,
                                      quantity_total, grant_id, step_up_challenge_id, approved_at)
      values (${historicalSnapshotId}, ${historicalVersionId}, ${designCaseId}, ${customRequestId},
              ${customerId}, ${CHECKSUM},
              ${productId}, ${productVariantId}, ${productSideId}, ${embroideryAreaId},
              'Legacy product', 'Navy / L', 'Front', 'Chest', 80, 60, 24,
              ${grantId}, ${challengeId}, now())
    `);
  }

  beforeAll(async () => {
    baseUrl = resolveDatabaseUrl();
    url = urlFor(name);
    baselineFolder = await buildFolder('baseline', [...POST_BASELINE_TAGS, ...TRAILING_TAGS]);
    targetFolder = await buildFolder('target', TRAILING_TAGS);

    await maintenance(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await maintenance(`CREATE DATABASE ${name}`);
    await runMigrations(configFor(url), baselineFolder);
    client = createDatabaseClient(configFor(url));

    await seedHistoricalCatalogRows();
  }, 300_000);

  afterAll(async () => {
    await client?.close();
    await maintenance(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
    if (baselineFolder !== undefined) {
      await rm(baselineFolder, { recursive: true, force: true }).catch(() => undefined);
    }
    if (targetFolder !== undefined) {
      await rm(targetFolder, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('starts from the real pre-0036 baseline with a NOT NULL Catalog quartet', async () => {
    const applied = await db().execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    expect((applied.rows[0] as { n: number }).n).toBe(BASELINE_MIGRATION_COUNT);

    const { rows } = await db().execute(sql`
      select table_name, column_name, is_nullable
        from information_schema.columns
       where table_schema = 'public'
         and table_name in ('design_versions', 'approval_snapshots')
         and column_name in ('product_id', 'product_variant_id',
                             'product_side_id', 'embroidery_area_id')
       order by table_name, column_name
    `);
    expect(rows).toHaveLength(8);
    for (const row of rows as unknown as { is_nullable: string }[]) {
      expect(row.is_nullable).toBe('NO');
    }
  });

  it('has no COP column on either table before the upgrade', async () => {
    const { rows } = await db().execute(sql`
      select table_name, column_name from information_schema.columns
       where table_schema = 'public'
         and table_name in ('design_versions', 'approval_snapshots')
         and column_name in ('customer_owned_product_id',
                             'placement_side_label', 'placement_area_label')
    `);
    expect(rows).toHaveLength(0);
  });

  describe('after applying 0036 from the committed folder', () => {
    beforeAll(async () => {
      await runMigrations(configFor(url), targetFolder);
    }, 120_000);

    it('records exactly one additional migration', async () => {
      const applied = await db().execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      expect((applied.rows[0] as { n: number }).n).toBe(FULL_MIGRATION_COUNT);
    });

    it.each(['design_versions', 'approval_snapshots'])(
      'made all four Catalog placement columns on %s nullable',
      async (table) => {
        const { rows } = await db().execute(sql`
          select column_name, is_nullable from information_schema.columns
           where table_schema = 'public' and table_name = ${table}
             and column_name in ('product_id', 'product_variant_id',
                                 'product_side_id', 'embroidery_area_id')
           order by column_name
        `);
        expect(rows).toEqual(
          CATALOG_PLACEMENT_COLUMNS.map((column_name) => ({ column_name, is_nullable: 'YES' })),
        );
      },
    );

    it('leaves the historical design version byte-for-byte as it was', async () => {
      const { rows } = await db().execute(sql`
        select product_id, product_variant_id, product_side_id, embroidery_area_id,
               customer_owned_product_id, placement_side_label, placement_area_label,
               physical_width_mm, physical_height_mm, document_hash, status
          from design_versions where id = ${historicalVersionId}
      `);
      expect(rows).toHaveLength(1);
      const row = rows[0] as unknown as Record<string, unknown>;
      // Still a complete Catalog row, and the migration invented neither a COP
      // identity nor a placement label to "complete" it.
      for (const column of CATALOG_PLACEMENT_COLUMNS) {
        expect(row[column]).not.toBeNull();
      }
      expect(row['customer_owned_product_id']).toBeNull();
      expect(row['placement_side_label']).toBeNull();
      expect(row['placement_area_label']).toBeNull();
      expect(row['document_hash']).toBe(CHECKSUM);
      expect(row['status']).toBe('APPROVED');
      expect(row['physical_width_mm']).toBe('80');
      expect(row['physical_height_mm']).toBe('60');
    });

    it('leaves the historical approval snapshot byte-for-byte as it was', async () => {
      const { rows } = await db().execute(sql`
        select product_id, product_variant_id, product_side_id, embroidery_area_id,
               customer_owned_product_id, product_name, variant_label, side_name, area_name,
               document_hash, quantity_total
          from approval_snapshots where id = ${historicalSnapshotId}
      `);
      expect(rows).toHaveLength(1);
      const row = rows[0] as unknown as Record<string, unknown>;
      for (const column of CATALOG_PLACEMENT_COLUMNS) {
        expect(row[column]).not.toBeNull();
      }
      expect(row['customer_owned_product_id']).toBeNull();
      expect(row['product_name']).toBe('Legacy product');
      expect(row['variant_label']).toBe('Navy / L');
      expect(row['side_name']).toBe('Front');
      expect(row['area_name']).toBe('Chest');
      expect(row['document_hash']).toBe(CHECKSUM);
      expect(row['quantity_total']).toBe(24);
    });

    it('backfilled nothing — not one COP identity across either table', async () => {
      // The failure this guards against is a well-meaning migration pointing
      // historical rows at some placeholder COP row so both branches "have an
      // answer". There is no customer-owned product behind these rows, so any
      // value would be fiction.
      const { rows } = await db().execute(sql`
        select (select count(*)::int from design_versions
                 where customer_owned_product_id is not null
                    or placement_side_label is not null
                    or placement_area_label is not null) as versions,
               (select count(*)::int from approval_snapshots
                 where customer_owned_product_id is not null) as snapshots,
               (select count(*)::int from customer_owned_products) as cops
      `);
      expect(rows[0]).toEqual({ versions: 0, snapshots: 0, cops: 0 });
    });

    it('carries both FKs and all three CHECKs', async () => {
      const { rows } = await db().execute(sql`
        select conname from pg_constraint
         where conrelid in ('design_versions'::regclass, 'approval_snapshots'::regclass)
           and conname in ('fk_design_versions__customer_owned_product_id',
                           'fk_approval_snapshots__customer_owned_product_id',
                           'ck_design_versions__exactly_one_placement_branch',
                           'ck_design_versions__cop_placement_labels',
                           'ck_approval_snapshots__exactly_one_placement_branch')
         order by conname
      `);
      expect(rows.map((r) => (r as { conname: string }).conname)).toEqual([
        'ck_approval_snapshots__exactly_one_placement_branch',
        'ck_design_versions__cop_placement_labels',
        'ck_design_versions__exactly_one_placement_branch',
        'fk_approval_snapshots__customer_owned_product_id',
        'fk_design_versions__customer_owned_product_id',
      ]);
    });

    it('left the untouched preview-hash CHECK installed and intact', async () => {
      // The generator emitted a spurious DROP + truncated re-ADD of this
      // constraint; both statements were removed from 0036 by hand. If that
      // trimming had been wrong, the constraint would be missing or would no
      // longer carry its `$` anchor.
      const { rows } = await db().execute(sql`
        select pg_get_constraintdef(oid) as def from pg_constraint
         where conname = 'ck_approval_snapshots__preview_hash_format'
      `);
      expect(rows).toHaveLength(1);
      expect((rows[0] as { def: string }).def).toContain('sha256:[0-9a-f]{64}$');
    });

    it('added no index to either table', async () => {
      const { rows } = await db().execute(sql`
        select indexname from pg_indexes
         where schemaname = 'public'
           and tablename in ('design_versions', 'approval_snapshots')
         order by indexname
      `);
      expect(rows.map((r) => (r as { indexname: string }).indexname)).toEqual([
        'ix_approval_snapshots__request',
        'pk_approval_snapshots',
        'pk_design_versions',
        'uq_approval_snapshots__version',
        'uq_design_versions__case__sent_for_review',
        'uq_design_versions__case_version',
      ]);
    });
  });
});
