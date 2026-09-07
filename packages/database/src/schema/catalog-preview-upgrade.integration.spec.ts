/**
 * APP2-DB01 — the upgrade path, run as an upgrade rather than described as one.
 *
 * A fresh install proves the end state; it cannot prove that an existing
 * database survives the constraint replacement. This suite builds the real
 * pre-APP2-DB01 baseline — migrations 0000-0031 only — seeds one representative
 * row for every derivative kind that existed then, and only afterwards applies
 * 0032 from the committed migrations folder.
 *
 * The baseline is produced by copying the committed migration files into a
 * temporary folder with a trimmed journal, so the SQL under test is byte-identical
 * to what is committed: a re-authored baseline would prove only that the copy is
 * self-consistent. Because the bytes match, the migrator's own hashes match too,
 * and the second run applies only the migrations the baseline withheld.
 */
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { sql } from 'drizzle-orm';
import { Client } from 'pg';

import { createDatabaseClient } from '../client/create-database-client';
import type { DatabaseClient } from '../client/create-database-client';
import { loadDatabaseConfig } from '../config/database-config';
import { driverErrorCode } from '../errors/driver-error';
import { runMigrations } from '../migrations/run-migrations';
import { newId } from '../primitives/identifiers';
import { disposableDatabaseName, migrationsFolder, resolveDatabaseUrl } from '../testing/index';

const run = promisify(execFile);

/** The migration this checkpoint adds; everything before it is the baseline. */
const NEW_MIGRATION_TAG = '0032_add_catalog_preview_derivative_kind';

/**
 * Migrations stripped to rebuild the pre-APP2-DB01 baseline.
 *
 * Every migration from 0032 onward must go, not just 0032 itself: this suite's
 * baseline is "the chain as it stood before APP2-DB01", and a later migration
 * left in the folder would be applied by the baseline run and silently change
 * what is being upgraded from.
 */
const POST_BASELINE_TAGS = [
  NEW_MIGRATION_TAG,
  '0033_provision_catalog_draft_categories',
  '0034_add_app3_placement_and_derivative_authority',
  '0035_add_app5_intake_provenance',
  '0036_add_app6_cop_design_context',
  '0037_add_app7_transfer_evidence_association',
  '0038_add_app12_ready_made_persistence',
  '0039_add_app12_product_media_invariants',
] as const;

/** Chain length before 0032, and after the full committed chain. */
const BASELINE_MIGRATION_COUNT = 31;
const FULL_MIGRATION_COUNT = 39;

/** One row per kind that existed before APP2-DB01, with its watermark reality. */
const LEGACY_ROWS = [
  { kind: 'PREVIEW_WATERMARKED', isWatermarked: true, status: 'READY' },
  { kind: 'MOCKUP', isWatermarked: false, status: 'READY' },
  { kind: 'NORMALIZED', isWatermarked: false, status: 'PROCESSING' },
  { kind: 'THUMBNAIL', isWatermarked: false, status: 'PENDING' },
] as const;

interface LegacySnapshot {
  readonly id: string;
  readonly asset_id: string;
  readonly kind: string;
  readonly status: string;
  readonly storage_key: string | null;
  readonly checksum: string | null;
  readonly is_watermarked: boolean;
}

describe('catalog preview upgrade path (integration)', () => {
  const name = disposableDatabaseName('app2db01-upgrade');
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

  /** Copies the committed migrations, minus 0032 onward, to a temp folder. */
  async function buildBaselineFolder(): Promise<string> {
    const source = migrationsFolder();
    const folder = await mkdtemp(join(tmpdir(), 'app2db01-baseline-'));
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

  async function snapshotDerivatives(): Promise<LegacySnapshot[]> {
    const { rows } = await db().execute(sql`
      select id, asset_id, kind, status, storage_key, checksum, is_watermarked
        from asset_derivatives order by kind
    `);
    return rows as unknown as LegacySnapshot[];
  }

  let before: LegacySnapshot[];

  it('starts from the real pre-APP2-DB01 baseline', async () => {
    const { rows } = await db().execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    expect((rows[0] as { n: number }).n).toBe(BASELINE_MIGRATION_COUNT);

    const { rows: constraints } = await db().execute(sql`
      select conname from pg_constraint
       where conrelid = 'asset_derivatives'::regclass and conname = 'ck_asset_derivatives__watermark_by_kind'
    `);
    expect(constraints).toHaveLength(0);
  });

  it('seeds one row per pre-existing kind, including a legacy watermark mismatch', async () => {
    for (const legacy of LEGACY_ROWS) {
      const assetId = newId();
      await db().execute(sql`
        insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
        values (${assetId}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
                ${`upgrade/originals/${assetId}/original.png`}, 'image/png', 4096,
                ${`sha256:${'c'.repeat(64)}`}, 'ACCEPTED')
      `);
      await db().execute(sql`
        insert into asset_derivatives (id, asset_id, kind, status, storage_key, checksum, is_watermarked)
        values (${newId()}, ${assetId}, ${legacy.kind}, ${legacy.status},
                ${legacy.status === 'READY' ? `upgrade/derivatives/${assetId}/${legacy.kind}.webp` : null},
                ${legacy.status === 'READY' ? `sha256:${'d'.repeat(64)}` : null},
                ${legacy.isWatermarked})
      `);
    }

    before = await snapshotDerivatives();
    expect(before.map((row) => row.kind)).toEqual([
      'MOCKUP',
      'NORMALIZED',
      'PREVIEW_WATERMARKED',
      'THUMBNAIL',
    ]);
  });

  it('applies the remaining committed migrations', async () => {
    await runMigrations(configFor(url), migrationsFolder());
    const { rows } = await db().execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    expect((rows[0] as { n: number }).n).toBe(FULL_MIGRATION_COUNT);
  });

  it('preserves every existing row byte for byte', async () => {
    const after = await snapshotDerivatives();
    expect(after).toEqual(before);
  });

  it('rewrites no historical kind', async () => {
    const { rows } = await db().execute(
      sql`select distinct kind from asset_derivatives order by kind`,
    );
    expect(rows.map((row) => (row as { kind: string }).kind)).toEqual([
      'MOCKUP',
      'NORMALIZED',
      'PREVIEW_WATERMARKED',
      'THUMBNAIL',
    ]);
  });

  it('accepts the new kind afterwards and enforces the new watermark rules', async () => {
    const assetId = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${assetId}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
              ${`upgrade/originals/${assetId}/original.png`}, 'image/png', 4096,
              ${`sha256:${'e'.repeat(64)}`}, 'INSPECTING')
    `);

    await expect(
      db().execute(sql`
        insert into asset_derivatives (id, asset_id, kind, status, is_watermarked)
        values (${newId()}, ${assetId}, 'CATALOG_PREVIEW', 'PENDING', false)
      `),
    ).resolves.toBeDefined();

    // Unwrapped through the canonical helper: drizzle attaches the `pg` error
    // as `cause`, so matching on `error.code` directly would never see 23514.
    let sqlState: string | undefined;
    try {
      await db().execute(sql`
        update asset_derivatives set is_watermarked = false where kind = 'PREVIEW_WATERMARKED'
      `);
    } catch (error: unknown) {
      sqlState = driverErrorCode(error);
    }
    expect(sqlState).toBe('23514');
  });

  it('reproduces the frozen fingerprint the fresh install produces', async () => {
    // The upgraded database and a fresh install must be the same schema. The
    // fingerprint gate is the committed comparison, so it is reused rather than
    // re-implemented here.
    const tools = join(migrationsFolder(), '..', 'tools');
    await expect(
      run(process.execPath, [join(tools, 'db-fingerprint-gate.mjs'), url], { timeout: 120_000 }),
    ).resolves.toBeDefined();
  });
});
