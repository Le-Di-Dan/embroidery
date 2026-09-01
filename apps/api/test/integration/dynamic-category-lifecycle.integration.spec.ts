/**
 * `APP12-C01-C1` — the dynamic-category proof, end to end, against a real
 * disposable database.
 *
 * The correction's whole claim is one sentence: **adding, renaming or
 * re-ordering a category is a data change, not a source change.** This suite is
 * that sentence made falsifiable.
 *
 * ## How it proves "no source edit"
 *
 * The application is booted **once**, in `beforeAll`, and never rebuilt,
 * restarted or re-imported. Every category below is created *after* that boot,
 * by inserting a row. If any part of the running system still held a compiled
 * taxonomy, these assertions could not pass — the process would answer with
 * whatever it was built with. That is a stronger statement than "the source
 * contains no list", which the anti-hardcode gate covers separately.
 *
 * ## No business data is touched
 *
 * Every row lives in a disposable PostgreSQL database that
 * `createApiIntegrationContext` provisions, migrates and drops. The context
 * refuses by name to run against the development database, and nothing here
 * touches a migration file. The slugs are deliberately values no migration ever
 * seeded, so a passing test cannot be an accident of `0033`'s reference data.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { createApiIntegrationContext } from '../support/api-integration-context';
import type { ApiIntegrationTestContext } from '../support/api-integration-context';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';

jest.setTimeout(180_000);

const CATEGORIES_PATH = '/api/public/categories';
const PRODUCTS_PATH = '/api/public/products';
const ADMIN_PRODUCTS_PATH = '/api/admin/products';

/**
 * Categories no migration ever created, with deliberately non-alphabetic
 * display orders so ordering cannot pass by accident.
 *
 * `tui-vai` is published and **non-indexable**: browsable, but never
 * sitemap-advertised. The API carries that fact; the Storefront applies it.
 */
const NEW_CATEGORY = { slug: 'mu-luoi-trai', name: 'Mũ lưỡi trai', displayOrder: 7 };
const NON_INDEXABLE = { slug: 'tui-vai', name: 'Túi vải', displayOrder: 3 };

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly data: T;
}

interface CategoryItem {
  readonly slug: string;
  readonly name: string;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
}

interface ProductSummary {
  readonly slug: string;
  readonly category: { readonly slug: string; readonly name: string };
}

/** Inserts one category row. SQL because category writes are `APP12-C02`. */
async function seedCategory(
  ctx: ApiIntegrationTestContext,
  input: {
    readonly slug: string;
    readonly name: string;
    readonly displayOrder: number;
    readonly status?: string;
    readonly isIndexable?: boolean;
  },
): Promise<void> {
  await ctx.database.client.db.execute(sql`
    insert into categories (id, name, slug, display_order, status, is_indexable, archived_at)
    values (${newId()}, ${input.name}, ${input.slug}, ${input.displayOrder},
            ${input.status ?? 'PUBLISHED'}, ${input.isIndexable ?? true}, null)
  `);
}

async function readInventory(ctx: ApiIntegrationTestContext): Promise<readonly CategoryItem[]> {
  const response = await ctx.http.get(CATEGORIES_PATH);
  expect(response.status).toBe(200);
  return (response.body as Envelope<{ items: readonly CategoryItem[] }>).data.items;
}

describe('adding a category needs no source change', () => {
  let ctx: ApiIntegrationTestContext;

  beforeAll(async () => {
    // Booted before any of the categories below exists. Nothing after this line
    // rebuilds, restarts or re-imports the application.
    ctx = await createApiIntegrationContext('app12c01c1-dynamic-add');
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('does not serve a category that has not been created yet', async () => {
    const items = await readInventory(ctx);

    expect(items.some((item) => item.slug === NEW_CATEGORY.slug)).toBe(false);
  });

  it('serves it as soon as the row exists, with the running process unchanged', async () => {
    await seedCategory(ctx, NEW_CATEGORY);

    const items = await readInventory(ctx);

    expect(items.find((item) => item.slug === NEW_CATEGORY.slug)).toEqual({
      slug: NEW_CATEGORY.slug,
      name: NEW_CATEGORY.name,
      isIndexable: true,
      displayOrder: NEW_CATEGORY.displayOrder,
    });
  });

  it('accepts it as a public Product filter immediately', async () => {
    const response = await ctx.http.get(`${PRODUCTS_PATH}?categorySlug=${NEW_CATEGORY.slug}`);

    expect(response.status).toBe(200);
  });

  it('accepts it as an Admin Product filter immediately', async () => {
    // Unauthenticated, so the answer is 401 rather than 200 — but never 400.
    // A 400 would mean the *contract* refused the slug, which is the ceiling
    // this correction removed; 401 means the value passed validation and only
    // the session was missing.
    const response = await ctx.http.get(`${ADMIN_PRODUCTS_PATH}?categorySlug=${NEW_CATEGORY.slug}`);

    expect(response.status).not.toBe(400);
  });

  it('stops serving it the moment it is archived, still with no source change', async () => {
    await ctx.database.client.db.execute(sql`
      update categories set status = 'ARCHIVED', archived_at = now()
      where slug = ${NEW_CATEGORY.slug}
    `);

    const items = await readInventory(ctx);

    expect(items.some((item) => item.slug === NEW_CATEGORY.slug)).toBe(false);
  });
});

describe('renaming a category needs no source change', () => {
  let ctx: ApiIntegrationTestContext;
  let productSlug: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app12c01c1-dynamic-rename');
    const adminId = await seedAdminId(ctx);
    await seedCategory(ctx, NEW_CATEGORY);

    const seeded = await seedPublishableProduct(ctx, {
      categorySlug: NEW_CATEGORY.slug,
      name: 'Mũ lưỡi trai thêu tay',
    });
    const publication = ctx.app.get(ProductPublicationService);
    await asAdmin(ctx, adminId, () =>
      publication.publish({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      }),
    );

    const [row] = (
      await ctx.database.client.db.execute(
        sql`select slug from products where id = ${seeded.productId}`,
      )
    ).rows as { slug: string }[];
    productSlug = row?.slug ?? '';
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('carries the current name on the public Product, before and after the rename', async () => {
    const before = await ctx.http.get(`${PRODUCTS_PATH}/${productSlug}`);
    expect((before.body as Envelope<ProductSummary>).data.category).toEqual({
      slug: NEW_CATEGORY.slug,
      name: NEW_CATEGORY.name,
    });

    await ctx.database.client.db.execute(sql`
      update categories set name = 'Mũ lưỡi trai cao cấp' where slug = ${NEW_CATEGORY.slug}
    `);

    const after = await ctx.http.get(`${PRODUCTS_PATH}/${productSlug}`);
    expect((after.body as Envelope<ProductSummary>).data.category).toEqual({
      // The slug — the public address — is unchanged. Only the label moved.
      slug: NEW_CATEGORY.slug,
      name: 'Mũ lưỡi trai cao cấp',
    });
  });

  it('carries the new name in the inventory too, from the same row', async () => {
    const items = await readInventory(ctx);

    expect(items.find((item) => item.slug === NEW_CATEGORY.slug)?.name).toBe(
      'Mũ lưỡi trai cao cấp',
    );
  });

  it('keeps the Product reachable at the same address after the rename', async () => {
    const response = await ctx.http.get(`${PRODUCTS_PATH}?categorySlug=${NEW_CATEGORY.slug}`);

    expect(response.status).toBe(200);
    const items = (response.body as Envelope<{ items: readonly ProductSummary[] }>).data.items;
    expect(items.map((item) => item.slug)).toContain(productSlug);
  });
});

describe('ordering and indexability come from the row', () => {
  let ctx: ApiIntegrationTestContext;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app12c01c1-dynamic-order');
    await seedCategory(ctx, NEW_CATEGORY);
    await seedCategory(ctx, { ...NON_INDEXABLE, isIndexable: false });
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('orders by display_order, not alphabetically and not by insertion', async () => {
    const items = await readInventory(ctx);
    const seeded = items.filter((item) =>
      [NEW_CATEGORY.slug, NON_INDEXABLE.slug].includes(item.slug),
    );

    // Inserted `mu-luoi-trai` first, but `tui-vai` has the lower display order —
    // and `mu-luoi-trai` sorts first alphabetically. Only the column explains
    // the observed order.
    expect(seeded.map((item) => item.slug)).toEqual([NON_INDEXABLE.slug, NEW_CATEGORY.slug]);
    expect(seeded.map((item) => item.displayOrder)).toEqual([3, 7]);
  });

  it('re-orders on the next read when the column changes', async () => {
    await ctx.database.client.db.execute(sql`
      update categories set display_order = 99 where slug = ${NON_INDEXABLE.slug}
    `);

    const items = await readInventory(ctx);
    const seeded = items.filter((item) =>
      [NEW_CATEGORY.slug, NON_INDEXABLE.slug].includes(item.slug),
    );

    expect(seeded.map((item) => item.slug)).toEqual([NEW_CATEGORY.slug, NON_INDEXABLE.slug]);
  });

  it('lists a published non-indexable category and reports it non-indexable', async () => {
    // Discover shows it; the sitemap must not. One read, two rules — and the
    // API's job is to carry the fact, not to apply the SEO rule.
    const items = await readInventory(ctx);

    expect(items.find((item) => item.slug === NON_INDEXABLE.slug)).toMatchObject({
      isIndexable: false,
    });
  });

  it('flips indexability on the next read, with no source change', async () => {
    await ctx.database.client.db.execute(sql`
      update categories set is_indexable = true where slug = ${NON_INDEXABLE.slug}
    `);

    const items = await readInventory(ctx);

    expect(items.find((item) => item.slug === NON_INDEXABLE.slug)).toMatchObject({
      isIndexable: true,
    });
  });

  it('never exposes a physical category id, whatever the row holds', async () => {
    for (const item of await readInventory(ctx)) {
      expect(Object.keys(item).sort()).toEqual(['displayOrder', 'isIndexable', 'name', 'slug']);
    }
  });
});
