/**
 * Feature service seam over the four `APP12-C02` category operations
 * (`APP12-A01`).
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as a `CategoryApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * ## Four operations, and there is no fifth
 *
 * `adminCategoryList`, `adminCategoryCreate`, `adminCategoryUpdate` and
 * `adminCategoryTransition` are the whole Admin category surface. There is no
 * delete: `APP12-C02` publishes none, because archiving is not deletion — the
 * row, its products and their history all survive an archive, and a category
 * keeps owning its slug forever so a retired public address can never be
 * silently reissued.
 *
 * ## Why the list is unpaged and unfiltered
 *
 * Because the read is. A taxonomy is navigation, not a feed: the contract
 * answers the whole inventory in every state, ordered by `displayOrder` then
 * `slug`, and refuses rather than truncates when it is too large. This module
 * therefore has no page cursor and no status parameter to pass, and never
 * re-sorts: the ordering is the operator's editorial authority and a second
 * sort here would be the one that quietly won.
 */
import {
  adminCategoryList,
  adminCategoryCreate,
  adminCategoryUpdate,
  adminCategoryTransition,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminCategoryListItemResponse,
  AdminCategoryResponse,
  CreateCategoryBody,
  TransitionCategoryBody,
  UpdateCategoryBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { CategoryApiError } from '../model/category-failure';

/** One row of the Admin taxonomy, exactly as the contract publishes it. */
export type AdminCategory = AdminCategoryListItemResponse;
/** The single-category record a mutation answers with. Carries no dependency count. */
export type AdminCategoryRecord = AdminCategoryResponse;

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    throw new CategoryApiError(normalizeApiClientError(error));
  }
}

/** The complete taxonomy — draft, published and archived alike, server-ordered. */
export async function fetchAdminCategories(
  signal?: AbortSignal,
): Promise<readonly AdminCategory[]> {
  const body = await call(() =>
    adminCategoryList({
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    }),
  );
  return body.data.items;
}

/** Creates a category. The server chooses `DRAFT`; this body cannot ask for another state. */
export async function createCategory(input: CreateCategoryBody): Promise<AdminCategoryRecord> {
  const body = await call(() => adminCategoryCreate(input, { instance: getBrowserApiClient() }));
  return body.data;
}

/** Edits one category. `expectedUpdatedAt` is the token last read for it. */
export async function updateCategory(
  categoryId: string,
  input: UpdateCategoryBody,
): Promise<AdminCategoryRecord> {
  const body = await call(() =>
    adminCategoryUpdate(categoryId, input, { instance: getBrowserApiClient() }),
  );
  return body.data;
}

/** Moves one category through its one-way lifecycle. Never a status PATCH. */
export async function transitionCategory(
  categoryId: string,
  input: TransitionCategoryBody,
): Promise<AdminCategoryRecord> {
  const body = await call(() =>
    adminCategoryTransition(categoryId, input, { instance: getBrowserApiClient() }),
  );
  return body.data;
}
