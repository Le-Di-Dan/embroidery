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
import { AdminProductListCategorySlug, AdminProductListStatus } from '@embroidery/api-client';
import type { AdminProductListParams } from '@embroidery/api-client';

import { PRODUCT_COPY } from './product-copy';

/** The presentation value meaning "no parameter". */
export const ALL_FILTER_VALUE = 'all';

export type ProductStatusFilter =
  typeof ALL_FILTER_VALUE | (typeof AdminProductListStatus)[keyof typeof AdminProductListStatus];

export type ProductCategoryFilter =
  | typeof ALL_FILTER_VALUE
  | (typeof AdminProductListCategorySlug)[keyof typeof AdminProductListCategorySlug];

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

export const PRODUCT_CATEGORY_FILTER_OPTIONS: readonly ProductFilterOption<ProductCategoryFilter>[] =
  [
    { value: ALL_FILTER_VALUE, label: PRODUCT_COPY.filters.categoryAll },
    { value: AdminProductListCategorySlug['thu-bong'], label: PRODUCT_COPY.category.thuBong },
    { value: AdminProductListCategorySlug.khan, label: PRODUCT_COPY.category.khan },
    { value: AdminProductListCategorySlug['quan-ao'], label: PRODUCT_COPY.category.quanAo },
    { value: AdminProductListCategorySlug.khac, label: PRODUCT_COPY.category.khac },
  ];

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
    category: normalizeOption(firstValue(raw.category), PRODUCT_CATEGORY_FILTER_OPTIONS),
  };
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
