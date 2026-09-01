/**
 * Shared helpers for the `APP12-C02` Admin category suites.
 *
 * Everything here goes through the **delivered API**: there is deliberately no
 * `insert into categories` helper, because a fixture that seeded a category with
 * SQL would let a suite pass while the operator surface it is meant to prove did
 * not work. `APP12-C01`'s suite seeds with SQL for the opposite reason — at that
 * checkpoint no write path existed yet.
 *
 * Test-only.
 */
import type { AdminCategoryService } from '../../src/modules/catalog/application/admin-category.service';
import { AdminCategoryQuery } from '../../src/modules/catalog/application/admin-category.query';
import type { AdminCategoryListItemView } from '../../src/modules/catalog/application/admin-category.projection';
import type { ApiIntegrationTestContext } from './api-integration-context';

export interface PublicCategoryItem {
  readonly slug: string;
  readonly name: string;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
}

const PUBLIC_CATEGORIES = '/api/public/categories';

/** The public inventory, read over real HTTP from the same running process. */
export async function readPublicInventory(
  ctx: ApiIntegrationTestContext,
): Promise<readonly PublicCategoryItem[]> {
  const response = await ctx.http.get(PUBLIC_CATEGORIES);
  if (response.status !== 200) {
    throw new Error(`Public category inventory answered ${response.status}.`);
  }
  return (response.body as { data: { items: readonly PublicCategoryItem[] } }).data.items;
}

/** The Admin inventory, through the delivered query. */
export async function readAdminCategories(
  ctx: ApiIntegrationTestContext,
): Promise<readonly AdminCategoryListItemView[]> {
  return (await ctx.app.get(AdminCategoryQuery).list()).items;
}

/**
 * Creates a category and publishes it, through the two delivered operations.
 *
 * Returns the **published** view, whose `updatedAt` is the token any later
 * mutation must echo.
 */
export async function publishCategory(
  service: AdminCategoryService,
  input: { readonly slug: string; readonly name: string; readonly displayOrder: number },
) {
  const draft = await service.create({
    slug: input.slug,
    name: input.name,
    isIndexable: true,
    displayOrder: input.displayOrder,
  });
  return service.transition({
    categoryId: draft.id,
    expectedUpdatedAt: new Date(draft.updatedAt),
    action: 'PUBLISH',
  });
}

/** Asserts `work` rejects with exactly `code` — never merely "some error". */
export async function rejectsWithCode(work: () => Promise<unknown>, code: string): Promise<void> {
  await expect(work()).rejects.toMatchObject({ code });
}
