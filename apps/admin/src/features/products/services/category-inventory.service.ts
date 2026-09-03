/**
 * Feature service seam over the category inventory the Product screens read
 * (`APP12-A01`).
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `ProductApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * ## Why this now reads the Admin operation, not the public one
 *
 * `APP12-C01-C1` pointed these screens at `GET /api/public/categories`, and
 * recorded exactly why that had to change here: at that moment every category
 * row was `PUBLISHED`, because nothing in the application could create one in
 * any other state, so the public read and the Admin read were the same set.
 *
 * `APP12-C02` ended that. Draft and archived categories now exist, and two
 * Product needs appear with them:
 *
 * - the **filter** must be able to name an archived category, or the products
 *   left behind under one become unfindable — `APP12-C02` made
 *   archived-category filtering valid deliberately;
 * - the **form** must offer only what the write path accepts, which is the
 *   published set and nothing wider.
 *
 * One read serves both. `adminCategory_list` carries each row's `status`, so
 * the two audiences are a filter over one answer rather than two operations
 * asking one question twice. Narrowing it here instead would give the filter
 * the form's answer.
 *
 * The read is authenticated Admin data, and it is the same read the category
 * management screen makes; nothing about a category is a secret.
 */
import { normalizeApiClientError } from '@embroidery/api-client';
import type { AdminCategoryListItemResponse } from '@embroidery/api-client';

import { fetchAdminCategories, isCategoryApiError } from '../../categories';
import { ProductApiError } from '../model/product-failure';

/** One category, in whatever lifecycle state it currently holds. */
export type ProductCategory = AdminCategoryListItemResponse;

/**
 * The complete taxonomy, in the server's `displayOrder` then `slug` ordering.
 *
 * The order is not re-sorted here or anywhere downstream: it is the operator's
 * own editorial authority, and a second sort would be the one that quietly won.
 *
 * The category feature's own error is re-wrapped as a `ProductApiError` at this
 * boundary so the product screens keep exactly one failure type to handle. The
 * normalized envelope is carried across unchanged rather than re-normalized:
 * `normalizeApiClientError` reads an Axios error, and by here the transport
 * error is already gone — re-running it would flatten a classified failure into
 * an unknown one.
 */
export async function fetchCategoryInventory(
  signal?: AbortSignal,
): Promise<readonly ProductCategory[]> {
  try {
    return await fetchAdminCategories(signal);
  } catch (error: unknown) {
    throw new ProductApiError(
      isCategoryApiError(error) ? error.normalized : normalizeApiClientError(error),
    );
  }
}
