/**
 * The two approved list filters and their wire mapping (`498:272`).
 *
 * Exactly two: status and category. There is no search, no sort selector and no
 * price, date or owner filter — the contract exposes none of them and the
 * approved design carries none of them.
 *
 * "All" is a presentation value, not a wire value: it means *omit the
 * parameter*, so an unfiltered request never sends `status=all` and the default
 * page truthfully contains drafts, published and archived products alike.
 */
import { AdminProductListStatus } from '@embroidery/api-client';
import type { AdminProductListParams } from '@embroidery/api-client';

import { CATEGORY_SLUG_PATTERN } from './category-slug-shape';
import type { ProductCategory } from '../services/category-inventory.service';
import { PRODUCT_COPY } from './product-copy';

/** The presentation value meaning "no parameter". */
export const ALL_FILTER_VALUE = 'all';

export type ProductStatusFilter =
  typeof ALL_FILTER_VALUE | (typeof AdminProductListStatus)[keyof typeof AdminProductListStatus];

/**
 * The category filter value: `all`, or any category slug (`APP12-C01-C1`).
 *
 * A `string` rather than a union, because the set of categories is data. The
 * options the operator can *choose* come from the inventory; a value arriving
 * from the URL is validated by shape, so a hand-edited address cannot put a
 * malformed value into a request.
 */
export type ProductCategoryFilter = string;

export interface ProductFilters {
  readonly status: ProductStatusFilter;
  readonly category: ProductCategoryFilter;
}

export const DEFAULT_PRODUCT_FILTERS: ProductFilters = {
  status: ALL_FILTER_VALUE,
  category: ALL_FILTER_VALUE,
};

/** The URL parameter names this screen owns. */
export const PRODUCT_FILTER_PARAMS = { status: 'status', category: 'category' } as const;

export interface ProductFilterOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

/** Option order is the approved order: "all" first, then the contract order. */
export const PRODUCT_STATUS_FILTER_OPTIONS: readonly ProductFilterOption<ProductStatusFilter>[] = [
  { value: ALL_FILTER_VALUE, label: PRODUCT_COPY.filters.statusAll },
  { value: AdminProductListStatus.DRAFT, label: PRODUCT_COPY.status.draft },
  { value: AdminProductListStatus.PUBLISHED, label: PRODUCT_COPY.status.published },
  { value: AdminProductListStatus.ARCHIVED, label: PRODUCT_COPY.status.archived },
];

/**
 * The category filter options: "all" first, then one per category the database
 * currently publishes (`APP12-C01-C1`).
 *
 * A function of the inventory rather than a constant, because a constant is
 * exactly what this correction removed. The order is the API's; the labels are
 * the rows' own names.
 *
 * While the inventory is loading or unavailable the caller passes `[]`, which
 * yields the "all" option alone — a truthful control that filters nothing rather
 * than a remembered list of categories that may no longer exist.
 */
export function toProductCategoryFilterOptions(
  categories: readonly ProductCategory[],
): readonly ProductFilterOption<ProductCategoryFilter>[] {
  return [
    { value: ALL_FILTER_VALUE, label: PRODUCT_COPY.filters.categoryAll },
    ...categories.map((category) => ({ value: category.slug, label: category.name })),
  ];
}

function normalizeOption<TValue extends string>(
  raw: unknown,
  options: readonly ProductFilterOption<TValue>[],
): TValue {
  const match = options.find((option) => option.value === raw);
  // An unknown, mistyped or hand-edited URL value is not an error state: it
  // normalizes to "all" and is never echoed back into the DOM.
  return match?.value ?? (ALL_FILTER_VALUE as TValue);
}

/** A raw URL/query value, which may be absent, repeated or arbitrary. */
export type RawFilterValue = string | readonly string[] | undefined;

function firstValue(raw: RawFilterValue): unknown {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Normalizes raw request/URL values into the closed filter model. Total by
 * construction: every input produces a valid `ProductFilters`.
 */
export function normalizeProductFilters(raw: {
  readonly status?: RawFilterValue;
  readonly category?: RawFilterValue;
}): ProductFilters {
  return {
    status: normalizeOption(firstValue(raw.status), PRODUCT_STATUS_FILTER_OPTIONS),
    category: normalizeCategory(firstValue(raw.category)),
  };
}

/**
 * Normalizes the category from the URL by **shape**, not by membership.
 *
 * Membership cannot be checked here: this function is synchronous and runs
 * before the inventory has loaded, and guessing "unknown, so show everything"
 * against a taxonomy the app has not read would drop a perfectly valid filter on
 * every page load. A well-formed slug is therefore kept and sent; the API
 * answers an unknown one with an empty page, which is its own safe policy, and
 * the empty state explains it.
 *
 * A malformed value still normalizes to "all" and is never echoed into a
 * request or into the DOM.
 */
function normalizeCategory(raw: unknown): ProductCategoryFilter {
  if (typeof raw !== 'string' || raw === ALL_FILTER_VALUE) return ALL_FILTER_VALUE;
  return CATEGORY_SLUG_PATTERN.test(raw) ? raw : ALL_FILTER_VALUE;
}

/**
 * The request parameters for a set of filters. "All" omits the parameter
 * entirely rather than sending a sentinel the API does not define.
 */
export function toProductListParams(
  filters: ProductFilters,
): Pick<AdminProductListParams, 'status' | 'categorySlug'> {
  return {
    ...(filters.status === ALL_FILTER_VALUE ? {} : { status: filters.status }),
    ...(filters.category === ALL_FILTER_VALUE ? {} : { categorySlug: filters.category }),
  };
}

/** Whether the operator has narrowed the list — decides which empty state applies. */
export function isAnyFilterActive(filters: ProductFilters): boolean {
  return filters.status !== ALL_FILTER_VALUE || filters.category !== ALL_FILTER_VALUE;
}

/**
 * The query string for a set of filters. A default filter is dropped, so the
 * unfiltered screen has a clean address and there is one URL per list state.
 */
export function toFilterSearchString(filters: ProductFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== ALL_FILTER_VALUE) {
    params.set(PRODUCT_FILTER_PARAMS.status, filters.status);
  }
  if (filters.category !== ALL_FILTER_VALUE) {
    params.set(PRODUCT_FILTER_PARAMS.category, filters.category);
  }
  return params.toString();
}
