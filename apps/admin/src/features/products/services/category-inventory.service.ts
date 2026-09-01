/**
 * Feature service seam over the category inventory read (`APP12-C01-C1`).
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `ProductApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * ## Why the Admin reads the *public* category operation
 *
 * Because the semantics match exactly, and duplicating a backend read without a
 * reason is how two answers to one question appear.
 *
 * `CategoryResolver` — the one place a `categorySlug` becomes a `category_id` on
 * the Admin write path — accepts a category only when its row is `PUBLISHED`.
 * So the set of categories a product may be filed under *is* the set
 * `GET /api/public/categories` returns: published and not archived. Offering the
 * operator a wider list would offer options the write path refuses.
 *
 * The read carries no customer data and no secret — a category's slug, name,
 * indexability and display order are the same facts the Storefront renders to
 * anonymous visitors — so reading it from an authenticated Admin screen leaks
 * nothing.
 *
 * ## What must change at `APP12-C02`, and why it is not needed yet
 *
 * `APP12-C02` introduces category creation, publication and archival, and with
 * them the first `DRAFT` and `ARCHIVED` categories this system can actually
 * hold. Two Admin needs appear at that moment and not before:
 *
 * - a management list that shows draft and archived categories;
 * - a Product **filter** able to name an archived category, so an operator can
 *   still find the products left behind under one.
 *
 * Both want `GET /api/admin/categories`, which `APP12-C02` owns. Adding it here
 * would be adding an operation with no reachable state behind it: today every
 * category row is `PUBLISHED`, because nothing in the application can create one
 * in any other state. `APP12-C02` must add that read and repoint this screen's
 * filter at it.
 */
import { publicCategoryList, normalizeApiClientError } from '@embroidery/api-client';
import type { PublicCategoryInventoryItemResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { ProductApiError } from '../model/product-failure';

/** One category an Admin product may be filed under, exactly as published. */
export type ProductCategory = PublicCategoryInventoryItemResponse;

/**
 * The current category inventory, in the server's `display_order` ordering.
 *
 * The order is not re-sorted here or anywhere downstream: it is the operator's
 * own editorial authority, and a second sort would be the one that quietly won.
 */
export async function fetchCategoryInventory(
  signal?: AbortSignal,
): Promise<readonly ProductCategory[]> {
  try {
    const body = await publicCategoryList({
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return body.data.items;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}
