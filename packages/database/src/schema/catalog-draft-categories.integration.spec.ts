/**
 * APP2-B02-G01 — the provisioned taxonomy on a fresh, fully migrated database.
 *
 * A fresh install proves the end state: the four canonical rows exist exactly
 * as locked, nothing else was created, and — because migration 0033 touches
 * data only — the frozen DB6 schema baseline and fingerprint are untouched.
 */
import { sql } from 'drizzle-orm';

import { APP2_CATEGORY_STATUS, APP2_CATEGORY_TAXONOMY } from './catalog/categories';
import { createDisposableDatabase, verifySchemaBaseline } from '../testing/index';
import type { DisposableDatabase } from '../testing/index';

interface CategoryRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly display_order: number;
  readonly status: string;
  readonly archived_at: Date | null;
  readonly is_indexable: boolean;
}

describe('catalog draft categories on a fresh database (integration)', () => {
  let database: DisposableDatabase;

  beforeAll(async () => {
    database = await createDisposableDatabase('app2b02g01-fresh');
  }, 240_000);

  afterAll(async () => {
    await database?.drop();
  });

  async function categories(): Promise<CategoryRow[]> {
    const { rows } = await database.client.db.execute(
      sql`select id, name, slug, description, display_order, status, archived_at, is_indexable
            from categories order by display_order`,
    );
    return rows as unknown as CategoryRow[];
  }

  it('applies the full 34-migration chain', async () => {
    const { rows } = await database.client.db.execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    expect((rows[0] as { n: number }).n).toBe(34);
  });

  it('provisions exactly the four canonical categories and no fifth row', async () => {
    const rows = await categories();
    expect(rows).toHaveLength(APP2_CATEGORY_TAXONOMY.length);
    expect(rows.map((row) => row.slug)).toEqual(APP2_CATEGORY_TAXONOMY.map((c) => c.slug));
  });

  it('stores the exact locked id, name, order, status and indexability', async () => {
    const rows = await categories();
    for (const [index, expected] of APP2_CATEGORY_TAXONOMY.entries()) {
      const row = rows[index] as CategoryRow;
      expect(row.id).toBe(expected.id);
      expect(row.name).toBe(expected.name);
      expect(row.slug).toBe(expected.slug);
      expect(row.display_order).toBe(expected.displayOrder);
      expect(row.status).toBe(APP2_CATEGORY_STATUS);
      expect(row.is_indexable).toBe(true);
      expect(row.archived_at).toBeNull();
      expect(row.description).toBeNull();
    }
  });

  it('creates no product, media or other catalog content', async () => {
    for (const table of ['products', 'product_media', 'product_variants', 'skus']) {
      const { rows } = await database.client.db.execute(
        sql`select count(*)::int as n from ${sql.identifier(table)}`,
      );
      expect({ table, n: (rows[0] as { n: number }).n }).toEqual({ table, n: 0 });
    }
  });

  it('is a re-runnable provisioning step: re-applying changes nothing', async () => {
    const before = await categories();
    // The migrator will not replay 0033, so the DO block is exercised directly
    // — the same statements, against a database that already holds the rows.
    const migration = APP2_CATEGORY_TAXONOMY.map(
      (c) => sql`
        insert into categories (id, name, slug, display_order, status, is_indexable)
        select ${c.id}::uuid, ${c.name}, ${c.slug}, ${c.displayOrder}, ${APP2_CATEGORY_STATUS}, true
         where not exists (select 1 from categories where slug = ${c.slug})`,
    );
    for (const statement of migration) {
      await database.client.db.execute(statement);
    }

    expect(await categories()).toEqual(before);
  });

  it('leaves the frozen DB6 schema baseline and fingerprint unchanged', async () => {
    const result = await verifySchemaBaseline(database.url);
    const failed = result.stages.filter((stage) => !stage.passed);
    expect({ passed: result.passed, failed }).toEqual({ passed: true, failed: [] });
  }, 240_000);

  it('keeps all 78 tables', async () => {
    const { rows } = await database.client.db.execute(
      sql`select count(*)::int as n from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect((rows[0] as { n: number }).n).toBe(78);
  });
});
