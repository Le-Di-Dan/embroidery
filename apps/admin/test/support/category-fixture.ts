/**
 * Admin category fixtures shaped exactly like the `APP12-C02` contract.
 *
 * `archivedAt` is **omitted by default**, because that is what the server
 * sends: it is absent unless the category is ARCHIVED. A fixture that always
 * supplied it would let the screen pass a test the real API could never
 * satisfy.
 *
 * The list row carries a name, a slug, a status, a display order, an
 * indexability flag, a published-product count and the concurrency token, and
 * nothing else — no parent, no depth, no description, no media, no product
 * list. `AdminCategoryListItemResponse` publishes none of them, so a screen
 * that rendered one is caught by the type rather than by a reviewer.
 *
 * The slugs here are the ones the approved frame draws, and all ids are
 * synthetic UUIDs; no real category identifier appears anywhere.
 */
import type {
  AdminCategoryListItemResponse,
  AdminCategoryListResponse,
  AdminCategoryResponse,
} from '@embroidery/api-client';

export const CATEGORY_ID_PUBLISHED = '019c0000-0000-7000-8000-000000001101';
export const CATEGORY_ID_DRAFT = '019c0000-0000-7000-8000-000000001102';
export const CATEGORY_ID_ARCHIVED = '019c0000-0000-7000-8000-000000001103';

export const UPDATED_AT = '2026-09-03T04:05:06Z';
/** The token a concurrent writer would have advanced the row to. */
export const UPDATED_AT_NEWER = '2026-09-03T04:09:09Z';

/** A PUBLISHED category with live products — the archive-blocking case (`915:381`). */
export function makePublishedCategory(
  overrides: Partial<AdminCategoryListItemResponse> = {},
): AdminCategoryListItemResponse {
  return {
    id: CATEGORY_ID_PUBLISHED,
    name: 'Áo thun',
    slug: 'ao-thun',
    status: 'PUBLISHED',
    displayOrder: 10,
    isIndexable: true,
    publishedProductCount: 12,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

/** A DRAFT category — never public, nothing filed under it yet (`915:408`). */
export function makeDraftCategory(
  overrides: Partial<AdminCategoryListItemResponse> = {},
): AdminCategoryListItemResponse {
  return {
    id: CATEGORY_ID_DRAFT,
    name: 'Quà tặng doanh nghiệp',
    slug: 'qua-tang-doanh-nghiep',
    status: 'DRAFT',
    displayOrder: 30,
    isIndexable: false,
    publishedProductCount: 0,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

/** An ARCHIVED category — read-only, still owning its slug (`915:417`). */
export function makeArchivedCategory(
  overrides: Partial<AdminCategoryListItemResponse> = {},
): AdminCategoryListItemResponse {
  return {
    id: CATEGORY_ID_ARCHIVED,
    name: 'Khác',
    slug: 'khac',
    status: 'ARCHIVED',
    displayOrder: 90,
    isIndexable: false,
    publishedProductCount: 0,
    updatedAt: UPDATED_AT,
    archivedAt: '2026-09-02T00:00:00Z',
    ...overrides,
  };
}

/** The whole taxonomy in server order: `displayOrder` then `slug`. */
export function makeInventory(
  items: readonly AdminCategoryListItemResponse[] = [
    makePublishedCategory(),
    makeDraftCategory(),
    makeArchivedCategory(),
  ],
): AdminCategoryListResponse {
  return { items: [...items] };
}

/**
 * The single-category record a mutation answers with.
 *
 * Deliberately without `publishedProductCount`: the contract's mutation
 * response does not carry it, which is why every write invalidates the list.
 */
export function makeCategoryRecord(
  overrides: Partial<AdminCategoryResponse> = {},
): AdminCategoryResponse {
  return {
    id: CATEGORY_ID_DRAFT,
    name: 'Quà tặng doanh nghiệp',
    slug: 'qua-tang-doanh-nghiep',
    status: 'DRAFT',
    displayOrder: 30,
    isIndexable: false,
    updatedAt: UPDATED_AT_NEWER,
    ...overrides,
  };
}

/** The standard success envelope every Admin operation returns. */
export function envelope<T>(data: T) {
  return { success: true as const, data, meta: { requestId: 'test-request' } } as never;
}
