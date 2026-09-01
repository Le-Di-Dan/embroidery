/**
 * `APP12-C01` over real HTTP, against a real disposable database.
 *
 * The service suite proves the query's arithmetic against a fake; this one
 * proves the two things a fake cannot:
 *
 * 1. **The visibility predicate is SQL.** Published, draft, archived and
 *    published-but-`noindex` categories are seeded as rows, and the wire is
 *    asked which of them it shows. A fake repository can only ever return what
 *    the test handed it.
 * 2. **A fifth category actually works, end to end.** `ao-thun` is created as a
 *    disposable fixture, a Product is filed under it through the real Admin
 *    draft seam and published through the real publication service, and the
 *    public catalog then serves and filters it. That is the fact the removed
 *    four-value enum denied — and the reason `APP11-S04-C1` had to defend
 *    against its own contract.
 *
 * ## No business data is touched
 *
 * Every row here is created inside a disposable PostgreSQL database that
 * `createApiIntegrationContext` provisions, migrates and drops. The development
 * database is never opened: the context refuses to run against it by name, and
 * nothing in this file publishes, archives, renames or re-orders a real
 * category. `APP12-G03` owns representative UAT data.
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

/** The fifth slug the removed enum could not name. */
const FIFTH_SLUG = 'ao-thun';

interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly data: T;
  readonly meta: { readonly requestId: string };
}

interface CategoryItem {
  readonly slug: string;
  readonly name: string;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
}

interface InventoryPayload {
  readonly items: readonly CategoryItem[];
}

interface ProductSummary {
  readonly slug: string;
  readonly category: { readonly slug: string; readonly name: string };
}

interface ProductListPayload {
  readonly items: readonly ProductSummary[];
}

/**
 * Inserts one category row directly.
 *
 * SQL rather than a service seam because there is none — category writes are
 * `APP12-C02`, and this checkpoint deliberately adds no way to create a
 * category through the application. That is exactly why the states below
 * (draft, archived, `noindex`) have to be built as rows.
 */
async function seedCategory(
  ctx: ApiIntegrationTestContext,
  input: {
    readonly slug: string;
    readonly name: string;
    readonly status: string;
    readonly displayOrder: number;
    readonly isIndexable?: boolean;
    readonly archived?: boolean;
  },
): Promise<string> {
  const id = newId();
  await ctx.database.client.db.execute(sql`
    insert into categories (id, name, slug, display_order, status, is_indexable, archived_at)
    values (${id}, ${input.name}, ${input.slug}, ${input.displayOrder}, ${input.status},
            ${input.isIndexable ?? true}, ${input.archived === true ? sql`now()` : null})
  `);
  return id;
}

async function readInventory(ctx: ApiIntegrationTestContext): Promise<readonly CategoryItem[]> {
  const response = await ctx.http.get(CATEGORIES_PATH);
  expect(response.status).toBe(200);
  return (response.body as Envelope<InventoryPayload>).data.items;
}

describe('public category inventory API', () => {
  let ctx: ApiIntegrationTestContext;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app12c01-public-categories');

    // The four provisioned rows already exist from migration 0033. These four
    // are the states that one migration does not produce.
    await seedCategory(ctx, {
      slug: FIFTH_SLUG,
      name: 'Áo thun',
      status: 'PUBLISHED',
      displayOrder: 40,
    });
    await seedCategory(ctx, {
      slug: 'phu-kien',
      name: 'Phụ kiện',
      status: 'PUBLISHED',
      displayOrder: 50,
      isIndexable: false,
    });
    await seedCategory(ctx, {
      slug: 'sap-ra-mat',
      name: 'Sắp ra mắt',
      status: 'DRAFT',
      displayOrder: 60,
    });
    await seedCategory(ctx, {
      slug: 'ngung-ban',
      name: 'Ngừng bán',
      status: 'ARCHIVED',
      displayOrder: 70,
      archived: true,
    });
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('serves the four provisioned categories plus the two new public ones', async () => {
    const items = await readInventory(ctx);

    expect(items.map((item) => item.slug)).toEqual([
      'thu-bong',
      'khan',
      'quan-ao',
      FIFTH_SLUG,
      'phu-kien',
      'khac',
    ]);
  });

  it('orders by displayOrder, not by insertion or slug', async () => {
    const items = await readInventory(ctx);

    expect(items.map((item) => item.displayOrder)).toEqual([10, 20, 30, 40, 50, 90]);
  });

  it('includes a published indexable category', async () => {
    const items = await readInventory(ctx);

    expect(items.find((item) => item.slug === FIFTH_SLUG)).toEqual({
      slug: FIFTH_SLUG,
      name: 'Áo thun',
      isIndexable: true,
      displayOrder: 40,
    });
  });

  it('includes a published non-indexable category, and says it is not indexable', async () => {
    // Visibility is not indexability: the chip must still render, and
    // `APP12-C03` needs this flag to keep it out of the sitemap.
    const items = await readInventory(ctx);

    expect(items.find((item) => item.slug === 'phu-kien')).toMatchObject({ isIndexable: false });
  });

  it('excludes a draft category', async () => {
    const items = await readInventory(ctx);

    expect(items.some((item) => item.slug === 'sap-ra-mat')).toBe(false);
  });

  it('excludes an archived category', async () => {
    const items = await readInventory(ctx);

    expect(items.some((item) => item.slug === 'ngung-ban')).toBe(false);
  });

  it('never publishes the physical category id or any internal field', async () => {
    const response = await ctx.http.get(CATEGORIES_PATH);
    const items = (response.body as Envelope<InventoryPayload>).data.items;

    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['displayOrder', 'isIndexable', 'name', 'slug']);
    }
  });

  it('is anonymous, enveloped and never stored', async () => {
    const response = await ctx.http.get(CATEGORIES_PATH);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.body as Envelope<InventoryPayload>;
    expect(body.success).toBe(true);
    expect(body.code).toBe('PUBLIC_CATEGORY_LIST_READ');
    expect(typeof body.meta.requestId).toBe('string');
  });
});

describe('the fifth category, end to end', () => {
  let ctx: ApiIntegrationTestContext;
  let productSlug: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app12c01-fifth-category');
    const adminId = await seedAdminId(ctx);

    await seedCategory(ctx, {
      slug: FIFTH_SLUG,
      name: 'Áo thun',
      status: 'PUBLISHED',
      displayOrder: 40,
    });

    // Through the real Admin draft seam: a fixture must not be able to file a
    // product the delivered API could not.
    const seeded = await seedPublishableProduct(ctx, {
      categorySlug: FIFTH_SLUG,
      name: 'Áo thun cotton thêu tay',
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

  it('appears in the category inventory', async () => {
    const items = await readInventory(ctx);

    expect(items.map((item) => item.slug)).toContain(FIFTH_SLUG);
  });

  it('is accepted by the Admin create contract and reaches the public detail', async () => {
    const response = await ctx.http.get(`${PRODUCTS_PATH}/${productSlug}`);

    expect(response.status).toBe(200);
    expect((response.body as Envelope<ProductSummary>).data.category).toEqual({
      slug: FIFTH_SLUG,
      name: 'Áo thun',
    });
  });

  it('is accepted and resolved by the public Product category filter', async () => {
    const response = await ctx.http.get(`${PRODUCTS_PATH}?categorySlug=${FIFTH_SLUG}`);

    expect(response.status).toBe(200);
    const items = (response.body as Envelope<ProductListPayload>).data.items;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.category.slug).toBe(FIFTH_SLUG);
    }
  });

  it('answers a well-formed but unknown category with an empty page, never an unfiltered one', async () => {
    // The safe resolution the dynamic contract requires. Not a 400 — that would
    // need a closed enum, and would tell an anonymous caller which slugs the
    // store has drafted. Not the whole catalogue either, which is the failure
    // mode that actually matters.
    const unknown = await ctx.http.get(`${PRODUCTS_PATH}?categorySlug=khong-ton-tai`);
    const unfiltered = await ctx.http.get(PRODUCTS_PATH);

    expect(unknown.status).toBe(200);
    expect((unknown.body as Envelope<ProductListPayload>).data.items).toEqual([]);
    expect((unfiltered.body as Envelope<ProductListPayload>).data.items.length).toBeGreaterThan(0);
  });

  it('still rejects a malformed category slug at the boundary', async () => {
    for (const slug of ['AO-THUN', 'ao_thun', 'ao%20thun', '-ao']) {
      const response = await ctx.http.get(`${PRODUCTS_PATH}?categorySlug=${slug}`);
      expect({ slug, status: response.status }).toEqual({ slug, status: 400 });
    }
  });
});
