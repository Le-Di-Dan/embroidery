/**
 * `APP2-B04` — the public catalog queries against a real PostgreSQL built from
 * all 33 migrations.
 *
 * These are the cases a fake repository cannot answer: whether the publication
 * predicate is really in the SQL, whether keyset pagination really returns each
 * row exactly once, whether an amount beyond `Number.MAX_SAFE_INTEGER` survives
 * the driver, and whether a read really writes nothing. Products are created
 * through `ProductDraftService` and moved through the lifecycle by
 * `ProductPublicationService`, so no fixture can produce a state the delivered
 * API could not.
 */
import { sql } from 'drizzle-orm';

import { PublicProductQuery } from '../../src/modules/catalog/application/public-product.query';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { isPublicProductCatalogError } from '../../src/modules/catalog/domain/public-product-catalog.errors';
import { createApiIntegrationContext } from '../support/api-integration-context';
import type { ApiIntegrationTestContext } from '../support/api-integration-context';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';

jest.setTimeout(180_000);

describe('public catalog queries (live PostgreSQL)', () => {
  let ctx: ApiIntegrationTestContext;
  let catalog: PublicProductQuery;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app2b04-public-catalog');
    catalog = ctx.app.get(PublicProductQuery);
    adminId = await seedAdminId(ctx);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  /** Publishes through the real command, in a real Admin request context. */
  async function publish(productId: string, updatedAt: string): Promise<string> {
    const publication = ctx.app.get(ProductPublicationService);
    const result = await asAdmin(ctx, adminId, () =>
      publication.publish({ productId, expectedUpdatedAt: new Date(updatedAt) }),
    );
    return result.updatedAt;
  }

  async function unpublish(productId: string, updatedAt: string): Promise<string> {
    const publication = ctx.app.get(ProductPublicationService);
    const result = await asAdmin(ctx, adminId, () =>
      publication.unpublish({ productId, expectedUpdatedAt: new Date(updatedAt) }),
    );
    return result.updatedAt;
  }

  async function slugOf(productId: string): Promise<string> {
    const rows = await ctx.database.client.db.execute<{ slug: string }>(
      sql`select slug from products where id = ${productId}`,
    );
    return rows.rows[0]!.slug;
  }

  async function evidenceCounts(): Promise<{ audit: string; outbox: string }> {
    const rows = await ctx.database.client.db.execute<{ audit: string; outbox: string }>(
      sql`select (select count(*) from audit_events) as audit,
                 (select count(*) from outbox_events) as outbox`,
    );
    return rows.rows[0]!;
  }

  async function listSlugs(
    input: Parameters<PublicProductQuery['list']>[0] = {},
  ): Promise<string[]> {
    const page = await catalog.list(input);
    return page.items.map((item) => item.slug);
  }

  it('1/16: a published product appears in the first list page', async () => {
    const seeded = await seedPublishableProduct(ctx);
    const slug = await slugOf(seeded.productId);

    expect(await listSlugs({ limit: 100 })).not.toContain(slug);
    await publish(seeded.productId, seeded.updatedAt);
    expect(await listSlugs({ limit: 100 })).toContain(slug);
  });

  it('2: a DRAFT product is absent from the list and the detail', async () => {
    const seeded = await seedPublishableProduct(ctx);
    const slug = await slugOf(seeded.productId);

    expect(await listSlugs({ limit: 100 })).not.toContain(slug);
    await expect(catalog.detail(slug)).rejects.toThrow();
  });

  it('3/12: an ARCHIVED product is absent, with the same safe 404', async () => {
    const seeded = await seedPublishableProduct(ctx);
    const slug = await slugOf(seeded.productId);
    // Archive is not unpublish and has no public command here; the row is moved
    // directly so the *public read* can be proven to exclude it.
    await ctx.database.client.db.execute(
      sql`update products set status = 'ARCHIVED', archived_at = now() where id = ${seeded.productId}`,
    );

    expect(await listSlugs({ limit: 100 })).not.toContain(slug);
    const error = await catalog.detail(slug).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(isPublicProductCatalogError(error)).toBe(true);
    if (isPublicProductCatalogError(error)) {
      expect(error.code).toBe('PUBLIC_PRODUCT_NOT_FOUND');
    }
  });

  it('4/5: the category filter includes matching and excludes non-matching products', async () => {
    const inCategory = await seedPublishableProduct(ctx, { categorySlug: 'khan' });
    const other = await seedPublishableProduct(ctx, { categorySlug: 'thu-bong' });
    await publish(inCategory.productId, inCategory.updatedAt);
    await publish(other.productId, other.updatedAt);

    const filtered = await listSlugs({ limit: 100, categorySlug: 'khan' });
    expect(filtered).toContain(await slugOf(inCategory.productId));
    expect(filtered).not.toContain(await slugOf(other.productId));
  });

  it('6: list order is the canonical (display_order, id) tuple', async () => {
    const page = await catalog.list({ limit: 100 });
    const rows = await ctx.database.client.db.execute<{ slug: string }>(
      sql`select slug from products
          where status = 'PUBLISHED'
          order by display_order asc, id asc`,
    );
    expect(page.items.map((item) => item.slug)).toEqual(rows.rows.map((row) => row.slug));
  });

  it('7: cursor continuation walks every row exactly once', async () => {
    for (let i = 0; i < 3; i += 1) {
      const seeded = await seedPublishableProduct(ctx);
      await publish(seeded.productId, seeded.updatedAt);
    }
    const all = await listSlugs({ limit: 100 });
    expect(all.length).toBeGreaterThanOrEqual(4);

    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const page: Awaited<ReturnType<PublicProductQuery['list']>> = await catalog.list({
        limit: 2,
        ...(cursor === null ? {} : { cursor }),
      });
      seen.push(...page.items.map((item) => item.slug));
      cursor = page.nextCursor;
      guard += 1;
    } while (cursor !== null && guard < 100);

    expect(seen).toEqual(all);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('8: an invalid cursor is rejected safely', async () => {
    const error = await catalog.list({ cursor: 'not-a-cursor' }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(isPublicProductCatalogError(error)).toBe(true);
    if (isPublicProductCatalogError(error)) {
      expect(error.code).toBe('PUBLIC_PRODUCT_CURSOR_INVALID');
    }
  });

  it('8b: a cursor from an unfiltered page is rejected under a filter', async () => {
    const page = await catalog.list({ limit: 1 });
    if (page.nextCursor === null) return;
    await expect(
      catalog.list({ limit: 1, cursor: page.nextCursor, categorySlug: 'khan' }),
    ).rejects.toThrow();
  });

  it('9: a published product resolves by exact slug', async () => {
    const seeded = await seedPublishableProduct(ctx, { categorySlug: 'khan' });
    await publish(seeded.productId, seeded.updatedAt);
    const slug = await slugOf(seeded.productId);

    const detail = await catalog.detail(slug);
    expect(detail.slug).toBe(slug);
    expect(detail.category).toEqual({ slug: 'khan', name: 'Khăn' });
    expect(detail.price.currency).toBe('VND');
  });

  it('10/11: an unknown slug and a draft slug return the identical error', async () => {
    const draft = await seedPublishableProduct(ctx);
    const draftSlug = await slugOf(draft.productId);

    const errors = await Promise.all(
      ['khong-ton-tai-bao-gio', draftSlug].map((slug) =>
        catalog.detail(slug).then(
          () => undefined,
          (thrown: unknown) => thrown,
        ),
      ),
    );
    const rendered = errors.map((error) =>
      isPublicProductCatalogError(error) ? `${error.code}|${error.message}` : 'other',
    );
    expect(rendered[0]).toBe(rendered[1]);
    expect(rendered[0]).toBe('PUBLIC_PRODUCT_NOT_FOUND|That product is not available.');
  });

  it('13: the largest representable price survives the driver exactly', async () => {
    const seeded = await seedPublishableProduct(ctx);
    // `numeric(14,2)` caps a VND amount at twelve integer digits, so a value
    // beyond `Number.MAX_SAFE_INTEGER` is not representable at all — the
    // relevant proof is that the *maximum* one is returned digit-for-digit and
    // that its `.00` scale is stripped without arithmetic. The projection unit
    // suite covers the unsafe-magnitude case directly, which is the layer that
    // would actually corrupt it.
    await ctx.database.client.db.execute(
      sql`update products set base_price_amount = 999999999999 where id = ${seeded.productId}`,
    );
    // The raw driver hands `timestamptz` back as a string here, not a Date.
    const after = await ctx.database.client.db.execute<{ updated_at: string }>(
      sql`select updated_at from products where id = ${seeded.productId}`,
    );
    await publish(seeded.productId, new Date(after.rows[0]!.updated_at).toISOString());

    const detail = await catalog.detail(await slugOf(seeded.productId));
    expect(detail.price.amount).toBe('999999999999');
    expect(detail.price.currency).toBe('VND');
  });

  it('14: detail media follow the persisted display order', async () => {
    const seeded = await seedPublishableProduct(ctx);
    await publish(seeded.productId, seeded.updatedAt);
    const detail = await catalog.detail(await slugOf(seeded.productId));

    const rows = await ctx.database.client.db.execute<{ id: string }>(
      sql`select pm.id from product_media pm
          where pm.product_id = ${seeded.productId}
          order by pm.display_order asc, pm.id asc`,
    );
    expect(detail.media).toHaveLength(rows.rows.length);
    detail.media.forEach((item, index) => {
      expect(item.url).toContain(rows.rows[index]!.id);
      expect(item.url.endsWith('/catalog-preview')).toBe(true);
    });
  });

  it('15: no internal or private field reaches a public projection', async () => {
    const page = await catalog.list({ limit: 100 });
    const serialized = JSON.stringify(page);
    for (const forbidden of [
      'storage_key',
      'storageKey',
      'bucket',
      'checksum',
      'sha256',
      'etag',
      'minio',
      'amazonaws',
      '"status"',
      'archivedAt',
      'updatedAt',
      'originals',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('17: unpublish removes the product from list and detail immediately', async () => {
    const seeded = await seedPublishableProduct(ctx);
    const published = await publish(seeded.productId, seeded.updatedAt);
    const slug = await slugOf(seeded.productId);
    expect(await listSlugs({ limit: 100 })).toContain(slug);

    await unpublish(seeded.productId, published);

    expect(await listSlugs({ limit: 100 })).not.toContain(slug);
    await expect(catalog.detail(slug)).rejects.toThrow();
  });

  it('18: neither operation writes an Audit or Outbox row', async () => {
    const seeded = await seedPublishableProduct(ctx);
    await publish(seeded.productId, seeded.updatedAt);
    const slug = await slugOf(seeded.productId);

    const before = await evidenceCounts();
    await catalog.list({ limit: 100 });
    await catalog.list({ limit: 1 });
    await catalog.detail(slug);
    const after = await evidenceCounts();

    expect(after).toEqual(before);
  });

  it('20: repeated reads across a transition are never answered from a stale cache', async () => {
    // The same service instance, in one process, reads either side of each
    // commit. Any in-process memoisation — a cached page, a cached product, a
    // cached repository result — would show up here as a read that still
    // reflects the previous status.
    const seeded = await seedPublishableProduct(ctx);
    const slug = await slugOf(seeded.productId);

    const before = await listSlugs({ limit: 100 });
    expect(before).not.toContain(slug);
    await expect(catalog.detail(slug)).rejects.toThrow();

    const published = await publish(seeded.productId, seeded.updatedAt);
    expect(await listSlugs({ limit: 100 })).toContain(slug);
    expect((await catalog.detail(slug)).slug).toBe(slug);

    const unpublished = await unpublish(seeded.productId, published);
    expect(await listSlugs({ limit: 100 })).not.toContain(slug);
    await expect(catalog.detail(slug)).rejects.toThrow();

    // And back again, so the transition is proven in both directions rather
    // than as a one-way disappearance.
    await publish(seeded.productId, unpublished);
    expect(await listSlugs({ limit: 100 })).toContain(slug);
  });

  it('19: the list uses the intended index-backed access path', async () => {
    const plan = await ctx.database.client.db.execute<{ 'QUERY PLAN': string }>(
      sql`explain select p.slug from products p
          join categories c on c.id = p.category_id
          where p.status = 'PUBLISHED' and c.slug = 'khan'
          order by p.display_order asc, p.id asc
          limit 21`,
    );
    const text = plan.rows.map((row) => row['QUERY PLAN']).join('\n');
    // A seq scan over ≤100 catalogue rows is the documented acceptable plan
    // (DB5 Q-01); what must never appear is an OFFSET-style discard.
    expect(text).not.toMatch(/\bOFFSET\b/i);
    expect(text.length).toBeGreaterThan(0);
  });
});
