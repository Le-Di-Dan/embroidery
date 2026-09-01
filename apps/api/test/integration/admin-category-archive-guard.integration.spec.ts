/**
 * `APP12-C02` — the archive dependency guard and Product write compatibility,
 * against a real disposable database.
 *
 * The rule under test: **a category cannot be archived while a PUBLISHED
 * Product still sits in it.** Delisting a category out from under a live product
 * page is a broken storefront, not a taxonomy edit — and the refusal must leave
 * both truths exactly as they were. Nothing is auto-unpublished,
 * auto-reassigned, or moved to a fallback category, because there is no fallback
 * category and inventing one would silently relabel a customer-visible product.
 *
 * The racing version of the same rule lives in
 * `admin-category-archive-races.integration.spec.ts`, which needs two
 * independent connection pools; this file proves the sequential semantics.
 *
 * Every category here is created through the delivered Admin API — no category
 * row is ever inserted with SQL — inside a disposable database the harness
 * provisions and drops.
 */
import { sql } from 'drizzle-orm';

import { AdminCategoryService } from '../../src/modules/catalog/application/admin-category.service';
import { ProductDraftService } from '../../src/modules/catalog/application/product-draft.service';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { createApiIntegrationContext } from '../support/api-integration-context';
import type { ApiIntegrationTestContext } from '../support/api-integration-context';
import {
  asAdmin,
  seedAdminId,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';
import {
  publishCategory,
  readAdminCategories,
  readPublicInventory,
  rejectsWithCode,
} from '../support/admin-category-fixtures';

jest.setTimeout(240_000);

describe('APP12-C02 archive dependency guard', () => {
  let ctx: ApiIntegrationTestContext;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app12c02-archive-guard');
    adminId = await seedAdminId(ctx);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const service = (): AdminCategoryService => ctx.app.get(AdminCategoryService);
  const publication = (): ProductPublicationService => ctx.app.get(ProductPublicationService);
  const act = <T>(work: () => Promise<T>): Promise<T> => asAdmin(ctx, adminId, work);

  /** A published category with one publishable DRAFT product already in it. */
  async function categoryWithProduct(slug: string, displayOrder: number) {
    const category = await act(() =>
      publishCategory(service(), { slug, name: `Danh mục ${displayOrder}`, displayOrder }),
    );
    const product = await seedPublishableProduct(ctx, { categorySlug: slug });
    return { category, product };
  }

  async function productRow(productId: string) {
    const [row] = (
      await ctx.database.client.db.execute(
        sql`select status, category_id from products where id = ${productId}`,
      )
    ).rows as { status: string; category_id: string }[];
    return row;
  }

  it('refuses to archive while a PUBLISHED product depends on the category', async () => {
    const { category, product } = await categoryWithProduct('tui-theu-tay', 71);

    await act(() =>
      publication().publish({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
      }),
    );

    // The count the operator sees before attempting the archive.
    expect(
      (await readAdminCategories(ctx)).find((item) => item.id === category.id)
        ?.publishedProductCount,
    ).toBe(1);

    await rejectsWithCode(
      () =>
        act(() =>
          service().transition({
            categoryId: category.id,
            expectedUpdatedAt: new Date(category.updatedAt),
            action: 'ARCHIVE',
          }),
        ),
      'CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS',
    );

    // Neither truth moved.
    const after = (await readAdminCategories(ctx)).find((item) => item.id === category.id);
    expect(after?.status).toBe('PUBLISHED');
    expect(after?.archivedAt).toBeUndefined();

    const row = await productRow(product.productId);
    expect(row?.status).toBe('PUBLISHED');
    expect(row?.category_id).toBe(category.id);

    expect((await readPublicInventory(ctx)).some((item) => item.slug === 'tui-theu-tay')).toBe(
      true,
    );
  });

  it('archives once the dependency is unpublished', async () => {
    const { category, product } = await categoryWithProduct('non-la-theu', 72);

    const published = await act(() =>
      publication().publish({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
      }),
    );
    await act(() =>
      publication().unpublish({
        productId: product.productId,
        expectedUpdatedAt: new Date(published.updatedAt),
      }),
    );

    const archived = await act(() =>
      service().transition({
        categoryId: category.id,
        expectedUpdatedAt: new Date(category.updatedAt),
        action: 'ARCHIVE',
      }),
    );

    expect(archived.status).toBe('ARCHIVED');
    expect(archived.archivedAt).toBeDefined();
    expect((await readPublicInventory(ctx)).some((item) => item.slug === 'non-la-theu')).toBe(
      false,
    );
    // The product survives untouched under an archived category. Archive is not
    // a delete and it is not a cascade.
    expect((await productRow(product.productId))?.category_id).toBe(category.id);
  });

  /**
   * A DRAFT product is not a dependency.
   *
   * Archiving is refused only by a *published* product: an unpublished draft has
   * no public page to break, and blocking on it would make a category
   * unarchivable for as long as any abandoned draft existed in it.
   */
  it('archives despite a DRAFT product in the category', async () => {
    const { category } = await categoryWithProduct('bo-ao-theu', 73);

    expect(
      (await readAdminCategories(ctx)).find((item) => item.id === category.id)
        ?.publishedProductCount,
    ).toBe(0);

    const archived = await act(() =>
      service().transition({
        categoryId: category.id,
        expectedUpdatedAt: new Date(category.updatedAt),
        action: 'ARCHIVE',
      }),
    );
    expect(archived.status).toBe('ARCHIVED');
  });

  describe('product write compatibility', () => {
    it('refuses a DRAFT category, accepts it once published, refuses it once archived', async () => {
      const drafts = ctx.app.get(ProductDraftService);
      const draft = await act(() =>
        service().create({
          slug: 'goi-om-theu',
          name: 'Gối ôm thêu',
          isIndexable: true,
          displayOrder: 81,
        }),
      );

      await rejectsWithCode(
        () => drafts.create({ categorySlug: 'goi-om-theu', name: 'Gối ôm thêu sen' }),
        'PRODUCT_CATEGORY_INVALID',
      );

      const published = await act(() =>
        service().transition({
          categoryId: draft.id,
          expectedUpdatedAt: new Date(draft.updatedAt),
          action: 'PUBLISH',
        }),
      );

      const created = await drafts.create({
        categorySlug: 'goi-om-theu',
        name: 'Gối ôm thêu sen',
      });
      expect(created.category.slug).toBe('goi-om-theu');

      await act(() =>
        service().transition({
          categoryId: draft.id,
          expectedUpdatedAt: new Date(published.updatedAt),
          action: 'ARCHIVE',
        }),
      );

      await rejectsWithCode(
        () => drafts.create({ categorySlug: 'goi-om-theu', name: 'Gối ôm thêu cúc' }),
        'PRODUCT_CATEGORY_INVALID',
      );
      // And an existing draft may not be *reassigned* into the archived one.
      await rejectsWithCode(
        () =>
          drafts.update({
            productId: created.productId,
            expectedUpdatedAt: new Date(created.updatedAt),
            categorySlug: 'goi-om-theu',
          }),
        'PRODUCT_CATEGORY_INVALID',
      );
    });

    /**
     * The Admin Product list filter must still name an archived category — the
     * products left behind under one are exactly the ones an operator needs to
     * find. The write path stays strict; only the read filter widened
     * (`CategoryResolver.requireAnyBySlug`).
     */
    it('still accepts an archived category as an Admin Product list filter', async () => {
      // Unauthenticated, so the answer is 401 — but never 400. A 400 would mean
      // the filter itself refused a category that genuinely exists.
      const response = await ctx.http.get('/api/admin/products?categorySlug=goi-om-theu');

      expect(response.status).not.toBe(400);
    });
  });
});
