/**
 * `APP2-B02` — the product-draft slice against a live PostgreSQL database.
 *
 * The whole application graph is wired from `AppModule` against a disposable
 * database with all 33 migrations, so the four provisioned categories are real
 * rows and every constraint, guard and transaction under test is the one that
 * ships. Assets are inserted directly because `APP2-B01`'s intake needs object
 * storage, which this suite deliberately does not require — the rows are shaped
 * exactly as intake writes them.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { ProductDraftQuery } from '../../src/modules/catalog/application/product-draft.query';
import { ProductDraftService } from '../../src/modules/catalog/application/product-draft.service';
import {
  PRODUCT_DRAFT_REPOSITORY,
  type ProductDraftId,
  type ProductDraftRepository,
} from '../../src/modules/catalog/domain/repositories/product-draft.repository';
import {
  createProductBodySchema,
  updateProductBodySchema,
} from '../../src/modules/catalog/presentation/schemas/admin-product.request';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';

interface AssetSeed {
  readonly kind?: string;
  readonly classification?: string;
  readonly status?: string;
}

describe('catalog draft management (integration)', () => {
  let ctx: ApiIntegrationTestContext;
  let drafts: ProductDraftService;
  let query: ProductDraftQuery;
  let repository: ProductDraftRepository;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app2b02-catalog-draft');
    drafts = ctx.app.get(ProductDraftService);
    query = ctx.app.get(ProductDraftQuery);
    repository = ctx.app.get<ProductDraftRepository>(PRODUCT_DRAFT_REPOSITORY);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  }, 120_000);

  /** A `CATALOG_MEDIA` asset shaped exactly as B01's intake writes one. */
  async function seedAsset(seed: AssetSeed = {}): Promise<string> {
    const id = newId();
    await ctx.database.client.db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, ${seed.kind ?? 'CATALOG_MEDIA'}, ${seed.classification ?? 'PRODUCTION_SENSITIVE'},
              ${`development/originals/${id}/original.png`}, 'image/png', 51200,
              ${`sha256:${'a'.repeat(64)}`}, ${seed.status ?? 'ACCEPTED'})
    `);
    return id;
  }

  async function countOf(table: string): Promise<number> {
    const { rows } = await ctx.database.client.db.execute(
      sql`select count(*)::int as n from ${sql.identifier(table)}`,
    );
    return (rows[0] as { n: number }).n;
  }

  async function codeOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return (error as { code?: string }).code ?? 'NO_CODE';
    }
    return 'NO_ERROR';
  }

  async function createDraft(name: string, categorySlug = 'thu-bong') {
    return drafts.create({ categorySlug, name });
  }

  // 1 / 2 / 3 -------------------------------------------------------------
  it('creates the canonical DRAFT with every locked default', async () => {
    const created = await createDraft('Thú bông gấu nâu');

    expect(created.status).toBe('DRAFT');
    expect(created.slug).toBe('thu-bong-gau-nau');
    expect(created.basePriceAmount).toBe('0');
    expect(created.currencyCode).toBe('VND');
    expect(created.category).toEqual({ slug: 'thu-bong', name: 'Thú bông' });
    expect(created.media).toEqual([]);

    const { rows } = await ctx.database.client.db.execute(sql`
      select status, slug, base_price_amount, currency_code, display_order,
             is_display_out_of_stock, is_indexable, archived_at, seo_title, seo_description
        from products where id = ${created.productId}
    `);
    expect(rows[0]).toMatchObject({
      status: 'DRAFT',
      slug: 'thu-bong-gau-nau',
      base_price_amount: '0.00',
      currency_code: 'VND',
      display_order: 0,
      is_display_out_of_stock: false,
      is_indexable: true,
      archived_at: null,
      // Publication-owned columns are left untouched by a draft create.
      seo_title: null,
      seo_description: null,
    });
  });

  it('creates no publication or outbox effect', async () => {
    const before = await countOf('outbox_events');
    await createDraft('Khăn tắm cotton', 'khan');
    expect(await countOf('outbox_events')).toBe(before);

    const { rows } = await ctx.database.client.db.execute(
      sql`select count(*)::int as n from products where status <> 'DRAFT'`,
    );
    expect((rows[0] as { n: number }).n).toBe(0);
  });

  // 4 / 5 / 6 / 7 / 8 -----------------------------------------------------
  it('lists a created draft, pages by cursor and keeps a stable order', async () => {
    const names = ['Áo thun A', 'Áo thun B', 'Áo thun C'];
    for (const name of names) {
      await createDraft(name, 'quan-ao');
    }

    const first = await query.list({ limit: 2, categorySlug: 'quan-ao' });
    expect(first.items).toHaveLength(2);
    expect(first.hasNext).toBe(true);
    expect(first.nextCursor).toBeDefined();

    const second = await query.list({
      limit: 2,
      categorySlug: 'quan-ao',
      ...(first.nextCursor === undefined ? {} : { cursor: first.nextCursor }),
    });
    expect(second.items).toHaveLength(1);
    expect(second.hasNext).toBe(false);

    const paged = [...first.items, ...second.items].map((item) => item.productId);
    expect(new Set(paged).size).toBe(3);

    // Newest first, with the id tie-breaker DB5 requires.
    const whole = await query.list({ limit: 100, categorySlug: 'quan-ao' });
    const keys = whole.items.map((item) => `${item.createdAt}|${item.productId}`);
    expect([...keys].sort().reverse()).toEqual(keys);
    expect(whole.items.map((item) => item.productId)).toEqual(paged);
  });

  it('filters by lifecycle status and by category slug', async () => {
    const all = await query.list({ limit: 100 });
    const drafts0 = await query.list({ limit: 100, status: 'DRAFT' });
    expect(drafts0.items).toHaveLength(all.items.length);
    expect(await query.list({ limit: 100, status: 'PUBLISHED' })).toMatchObject({ items: [] });

    const towels = await query.list({ limit: 100, categorySlug: 'khan' });
    expect(towels.items.every((item) => item.category.slug === 'khan')).toBe(true);
    expect(towels.items.length).toBeGreaterThan(0);
  });

  it('rejects a malformed cursor instead of silently restarting', async () => {
    expect(await codeOf(() => query.list({ cursor: 'not-a-cursor' }))).toBe(
      'PRODUCT_CURSOR_INVALID',
    );
    expect(
      await codeOf(() => query.list({ cursor: Buffer.from('{}').toString('base64url') })),
    ).toBe('PRODUCT_CURSOR_INVALID');
  });

  // 9 / 10 ----------------------------------------------------------------
  it('returns one draft by id and a safe not-found for an unknown one', async () => {
    const created = await createDraft('Khăn mặt nhỏ', 'khan');
    const detail = await query.detail(created.productId);
    expect(detail.productId).toBe(created.productId);
    expect(detail.slug).toBe('khan-mat-nho');

    expect(await codeOf(() => query.detail(newId()))).toBe('PRODUCT_NOT_FOUND');
  });

  // 11 / 12 / 13 / 14 / 16 -------------------------------------------------
  it('updates one editable field and bumps the concurrency token', async () => {
    const created = await createDraft('Gấu bông xám');
    const updated = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(created.updatedAt),
      name: 'Gấu bông xám nhạt',
    });

    expect(updated.name).toBe('Gấu bông xám nhạt');
    // The slug is server-owned and immutable: renaming never moves the address.
    expect(updated.slug).toBe(created.slug);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.updatedAt).getTime(),
    );
  });

  it('updates several editable fields atomically', async () => {
    const created = await createDraft('Khăn lau bếp', 'khan');
    const updated = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(created.updatedAt),
      name: 'Khăn lau bếp lớn',
      description: 'Sợi bông',
      basePriceAmount: '250000',
      categorySlug: 'khac',
    });

    expect(updated).toMatchObject({
      name: 'Khăn lau bếp lớn',
      description: 'Sợi bông',
      basePriceAmount: '250000',
      category: { slug: 'khac', name: 'Khác' },
    });
  });

  it('rejects an unknown patch field and an empty patch at the contract', () => {
    const at = new Date().toISOString();
    expect(updateProductBodySchema.safeParse({ expectedUpdatedAt: at, slug: 'x' }).success).toBe(
      false,
    );
    expect(updateProductBodySchema.safeParse({ expectedUpdatedAt: at }).success).toBe(false);
    expect(
      createProductBodySchema.safeParse({ categorySlug: 'khan', name: 'X', id: newId() }).success,
    ).toBe(false);
  });

  it('rejects a stale concurrency token without overwriting the newer value', async () => {
    const created = await createDraft('Gấu bông trắng');
    const stale = new Date(created.updatedAt);
    await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: stale,
      name: 'Gấu bông trắng ngà',
    });

    expect(
      await codeOf(() =>
        drafts.update({
          productId: created.productId,
          expectedUpdatedAt: stale,
          name: 'Ghi đè',
        }),
      ),
    ).toBe('PRODUCT_VERSION_CONFLICT');

    const after = await query.detail(created.productId);
    expect(after.name).toBe('Gấu bông trắng ngà');
  });

  // 15 --------------------------------------------------------------------
  it('refuses to edit a product that is not a DRAFT', async () => {
    const created = await createDraft('Khăn cũ', 'khan');
    const archived = await drafts.archive({
      productId: created.productId,
      expectedUpdatedAt: new Date(created.updatedAt),
    });

    expect(
      await codeOf(() =>
        drafts.update({
          productId: created.productId,
          expectedUpdatedAt: new Date(archived.updatedAt),
          name: 'Không được',
        }),
      ),
    ).toBe('PRODUCT_NOT_EDITABLE');
  });

  // 17 / 18 / 19 / 20 / 21 / 22 / 23 --------------------------------------
  it('replaces the media selection in request order with derived roles', async () => {
    const created = await createDraft('Thú bông có ảnh');
    const [first, second] = [await seedAsset(), await seedAsset()];

    const withMedia = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(created.updatedAt),
      mediaAssetIds: [first, second],
    });

    expect(withMedia.media.map((item) => [item.assetId, item.role, item.position])).toEqual([
      [first, 'THUMBNAIL', 0],
      [second, 'GALLERY', 1],
    ]);
    expect(withMedia.primaryMedia?.assetId).toBe(first);

    // A complete replacement in the opposite order re-derives the roles.
    const reordered = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(withMedia.updatedAt),
      mediaAssetIds: [second, first],
    });
    expect(reordered.media.map((item) => [item.assetId, item.role])).toEqual([
      [second, 'THUMBNAIL'],
      [first, 'GALLERY'],
    ]);

    // DETAIL is never written by APP2-B02.
    const { rows } = await ctx.database.client.db.execute(
      sql`select distinct role from product_media`,
    );
    expect(rows.map((row) => (row as { role: string }).role).sort()).toEqual([
      'GALLERY',
      'THUMBNAIL',
    ]);
  });

  it('rejects a duplicate, missing, unaccepted or foreign asset', async () => {
    const created = await createDraft('Thú bông kiểm tra ảnh');
    const good = await seedAsset();
    const pending = await seedAsset({ status: 'INSPECTING' });
    const foreign = await seedAsset({
      kind: 'CUSTOMER_UPLOAD',
      classification: 'CUSTOMER_PRIVATE',
    });
    const at = new Date(created.updatedAt);

    const cases: ReadonlyArray<[readonly string[], string]> = [
      [[good, good], 'PRODUCT_MEDIA_DUPLICATE'],
      [[newId()], 'PRODUCT_MEDIA_ASSET_NOT_FOUND'],
      [[pending], 'PRODUCT_MEDIA_ASSET_UNAVAILABLE'],
      // A foreign lane is reported as missing, never as "exists but forbidden".
      [[foreign], 'PRODUCT_MEDIA_ASSET_NOT_FOUND'],
    ];

    for (const [mediaAssetIds, expected] of cases) {
      expect(
        await codeOf(() =>
          drafts.update({ productId: created.productId, expectedUpdatedAt: at, mediaAssetIds }),
        ),
      ).toBe(expected);
    }
  });

  it('rolls the whole update back when one media item is invalid', async () => {
    const created = await createDraft('Thú bông giữ nguyên');
    const good = await seedAsset();
    const first = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(created.updatedAt),
      mediaAssetIds: [good],
    });

    const code = await codeOf(() =>
      drafts.update({
        productId: created.productId,
        expectedUpdatedAt: new Date(first.updatedAt),
        name: 'Tên mới không được lưu',
        mediaAssetIds: [good, newId()],
      }),
    );
    expect(code).toBe('PRODUCT_MEDIA_ASSET_NOT_FOUND');

    // Neither the field nor the selection moved.
    const after = await query.detail(created.productId);
    expect(after.name).toBe('Thú bông giữ nguyên');
    expect(after.media.map((item) => item.assetId)).toEqual([good]);
    expect(after.updatedAt).toBe(first.updatedAt);
  });

  it('removes only the link when media is cleared, never the asset', async () => {
    const created = await createDraft('Thú bông bỏ ảnh');
    const asset = await seedAsset();
    const withMedia = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(created.updatedAt),
      mediaAssetIds: [asset],
    });

    const cleared = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(withMedia.updatedAt),
      mediaAssetIds: [],
    });
    expect(cleared.media).toEqual([]);

    const { rows } = await ctx.database.client.db.execute(
      sql`select status, storage_key, checksum from assets where id = ${asset}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'ACCEPTED' });
  });

  // 24 / 25 / 26 ----------------------------------------------------------
  it('archives a draft, keeps everything, and refuses a second archive', async () => {
    const created = await createDraft('Thú bông lưu trữ');
    const asset = await seedAsset();
    const withMedia = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(created.updatedAt),
      mediaAssetIds: [asset],
    });

    const archived = await drafts.archive({
      productId: created.productId,
      expectedUpdatedAt: new Date(withMedia.updatedAt),
    });
    expect(archived.status).toBe('ARCHIVED');
    expect(archived.archivedAt).toBeDefined();
    // Archive is not delete: the row, its links and the asset all survive.
    expect(archived.media.map((item) => item.assetId)).toEqual([asset]);

    const { rows } = await ctx.database.client.db.execute(sql`
      select (select count(*)::int from products where id = ${created.productId}) as products,
             (select count(*)::int from product_media where product_id = ${created.productId}) as links,
             (select count(*)::int from assets where id = ${asset}) as assets
    `);
    expect(rows[0]).toEqual({ products: 1, links: 1, assets: 1 });

    expect(
      await codeOf(() =>
        drafts.archive({
          productId: created.productId,
          expectedUpdatedAt: new Date(archived.updatedAt),
        }),
      ),
    ).toBe('PRODUCT_ARCHIVE_NOT_ALLOWED');
  });

  it('reports an unknown product and a stale token distinctly on archive', async () => {
    expect(
      await codeOf(() => drafts.archive({ productId: newId(), expectedUpdatedAt: new Date() })),
    ).toBe('PRODUCT_NOT_FOUND');

    const created = await createDraft('Thú bông xung đột');
    expect(
      await codeOf(() =>
        drafts.archive({
          productId: created.productId,
          expectedUpdatedAt: new Date('2020-01-01T00:00:00.000Z'),
        }),
      ),
    ).toBe('PRODUCT_VERSION_CONFLICT');
  });

  // 27 --------------------------------------------------------------------
  it('scopes reads to the single canonical Admin catalog', async () => {
    // Recorded fact, not an assumption: `products` carries no owner, tenant or
    // store column, because REQ-IDN-001 defines exactly one Admin actor. The
    // canonical Admin scope is therefore the whole catalog, and the guard that
    // matters is authentication — asserted in the API suite.
    const { rows } = await ctx.database.client.db.execute(sql`
      select column_name from information_schema.columns
       where table_name = 'products'
         and column_name in ('owner_id', 'tenant_id', 'store_id', 'created_by_admin_id')
    `);
    expect(rows).toEqual([]);

    const listed = await query.list({ limit: 100 });
    const { rows: total } = await ctx.database.client.db.execute(
      sql`select count(*)::int as n from products`,
    );
    expect(listed.items.length).toBe((total[0] as { n: number }).n);
  });

  // 28 / 29 ---------------------------------------------------------------
  it('leaves no partial mutation when the transaction rolls back', async () => {
    const created = await createDraft('Thú bông nguyên vẹn');
    const linksBefore = await countOf('product_media');

    await codeOf(() =>
      drafts.update({
        productId: created.productId,
        expectedUpdatedAt: new Date(created.updatedAt),
        name: 'Không lưu',
        description: 'Không lưu',
        basePriceAmount: '999',
        mediaAssetIds: [newId()],
      }),
    );

    const after = await query.detail(created.productId);
    expect(after).toMatchObject({
      name: 'Thú bông nguyên vẹn',
      description: undefined,
      basePriceAmount: '0',
      updatedAt: created.updatedAt,
    });
    expect(await countOf('product_media')).toBe(linksBefore);
  });

  it('guards on database truth, not on a value the caller supplied', async () => {
    const created = await createDraft('Thú bông bảo vệ');
    const id = created.productId as ProductDraftId;

    // A guarded update whose token matches nothing writes nothing and says why.
    const stale = await repository.updateGuarded({
      id,
      expectedUpdatedAt: new Date('2020-01-01T00:00:00.000Z'),
      editableStates: ['DRAFT'],
      fields: { name: 'Không được ghi' },
    });
    expect(stale).toEqual({ ok: false, reason: 'STALE' });

    const missing = await repository.updateGuarded({
      id: newId() as ProductDraftId,
      expectedUpdatedAt: new Date(),
      editableStates: ['DRAFT'],
      fields: { name: 'X' },
    });
    expect(missing).toEqual({ ok: false, reason: 'NOT_FOUND' });

    const wrongState = await repository.updateGuarded({
      id,
      expectedUpdatedAt: new Date(created.updatedAt),
      editableStates: ['PUBLISHED'],
      fields: { name: 'X' },
    });
    expect(wrongState).toEqual({ ok: false, reason: 'STATE' });

    const unchanged = await query.detail(created.productId);
    expect(unchanged.name).toBe('Thú bông bảo vệ');
  });

  // 30 --------------------------------------------------------------------
  it('runs against a disposable database that is dropped afterwards', () => {
    expect(ctx.database.name).toMatch(/^embroidery_db7_/);
    expect(ctx.database.name).not.toBe('embroidery');
  });
});
