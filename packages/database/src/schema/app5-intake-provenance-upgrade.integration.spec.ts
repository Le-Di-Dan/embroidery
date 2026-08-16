/**
 * APP5-DB01 — the 0034 → 0035 upgrade, run as an upgrade rather than described
 * as one.
 *
 * A fresh install proves the end state; it cannot prove that a database already
 * holding APP1–APP4 assets survives the two new columns and their CHECKs. This
 * suite builds the real pre-APP5-DB01 baseline — migrations 0000–0034 only —
 * seeds asset rows that have no intake provenance because the columns do not
 * yet exist, and only afterwards applies 0035 from the committed migrations
 * folder.
 *
 * The baseline is produced by copying the committed migration files into a
 * temporary folder with a trimmed journal, so the SQL under test is
 * byte-identical to what is committed: a re-authored baseline would prove only
 * that the copy is self-consistent.
 *
 * What must hold: nothing is backfilled, no historical row is rewritten, and
 * every pre-existing row still satisfies both CHECKs without being touched.
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

const NEW_MIGRATION_TAG = '0035_add_app5_intake_provenance';
const POST_BASELINE_TAGS = [NEW_MIGRATION_TAG] as const;

const BASELINE_MIGRATION_COUNT = 34;
const FULL_MIGRATION_COUNT = 35;

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

describe('APP5 intake provenance upgrade path (integration)', () => {
  const name = disposableDatabaseName('app5db01-upgrade');
  let baseUrl: string;
  let url: string;
  let baselineFolder: string;
  let client: DatabaseClient | undefined;
  const historical: string[] = [];

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
    const folder = await mkdtemp(join(tmpdir(), 'app5db01-baseline-'));
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

  const db = (): DatabaseClient['db'] => {
    if (client === undefined) {
      throw new Error('The upgrade database client was not initialised.');
    }
    return client.db;
  };

  async function seedHistoricalAsset(kind: string, classification: string): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                          checksum, status)
      values (${id}, ${kind}, ${classification}, ${`legacy/${id}/original.png`},
              'image/png', 4096, ${CHECKSUM}, 'ACCEPTED')
    `);
    return id;
  }

  beforeAll(async () => {
    baseUrl = resolveDatabaseUrl();
    url = urlFor(name);
    baselineFolder = await buildBaselineFolder();

    await maintenance(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await maintenance(`CREATE DATABASE ${name}`);
    await runMigrations(configFor(url), baselineFolder);
    client = createDatabaseClient(configFor(url));

    historical.push(await seedHistoricalAsset('CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE'));
    historical.push(await seedHistoricalAsset('CATALOG_MEDIA', 'PUBLIC'));
    historical.push(await seedHistoricalAsset('PRODUCTION_FILE', 'PRODUCTION_SENSITIVE'));
  }, 300_000);

  afterAll(async () => {
    await client?.close();
    await maintenance(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
    if (baselineFolder !== undefined) {
      await rm(baselineFolder, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('starts from the real pre-0035 baseline with neither column present', async () => {
    const applied = await db().execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    expect((applied.rows[0] as { n: number }).n).toBe(BASELINE_MIGRATION_COUNT);

    const { rows } = await db().execute(sql`
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'assets'
         and column_name in ('uploaded_via_challenge_id', 'intake_expires_at')
    `);
    expect(rows).toHaveLength(0);
  });

  describe('after applying 0035 from the committed folder', () => {
    beforeAll(async () => {
      await runMigrations(configFor(url), migrationsFolder());
    }, 120_000);

    it('records exactly one additional migration', async () => {
      const applied = await db().execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      expect((applied.rows[0] as { n: number }).n).toBe(FULL_MIGRATION_COUNT);
    });

    it('leaves every historical asset row untouched and NULL on both columns', async () => {
      const { rows } = await db().execute(sql`
        select id, uploaded_via_challenge_id, intake_expires_at
          from assets order by id
      `);
      expect(rows).toHaveLength(historical.length);
      for (const row of rows as unknown as {
        uploaded_via_challenge_id: string | null;
        intake_expires_at: Date | null;
      }[]) {
        expect(row.uploaded_via_challenge_id).toBeNull();
        expect(row.intake_expires_at).toBeNull();
      }
    });

    it('does not invent a due time for a historical row', async () => {
      // The failure this guards against is a well-meaning backfill deriving
      // `intake_expires_at` from `created_at` plus a TTL. There is no challenge
      // behind these rows, so any value would be fiction.
      const { rows } = await db().execute(sql`
        select count(*)::int as n from assets where intake_expires_at is not null
      `);
      expect((rows[0] as { n: number }).n).toBe(0);
    });

    it('carries the FK, both CHECKs and both indexes', async () => {
      const constraints = await db().execute(sql`
        select conname from pg_constraint
         where conrelid = 'assets'::regclass
           and conname in ('fk_assets__uploaded_via_challenge_id',
                           'ck_assets__single_intake_lane',
                           'ck_assets__challenge_intake_requires_expiry')
         order by conname
      `);
      expect(constraints.rows.map((r) => (r as { conname: string }).conname)).toEqual([
        'ck_assets__challenge_intake_requires_expiry',
        'ck_assets__single_intake_lane',
        'fk_assets__uploaded_via_challenge_id',
      ]);

      const indexes = await db().execute(sql`
        select indexname from pg_indexes
         where schemaname = 'public' and tablename = 'assets'
           and indexname in ('ix_assets__challenge_status__intake_live',
                             'ix_assets__intake_expires_id__live')
         order by indexname
      `);
      expect(indexes.rows).toHaveLength(2);
    });

    it('still accepts an ordinary update to a historical row', async () => {
      const id = historical[0];
      await db().execute(sql`update assets set updated_at = now() where id = ${id}`);
      const { rows } = await db().execute(
        sql`select count(*)::int as n from assets where id = ${id}`,
      );
      expect((rows[0] as { n: number }).n).toBe(1);
    });
  });
});
