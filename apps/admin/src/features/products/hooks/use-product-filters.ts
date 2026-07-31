'use client';

/**
 * The filter state, held in the URL rather than in a component.
 *
 * The address bar is the right owner here: a filtered list is a place the
 * operator can bookmark, reload and share, and the server segment reads the
 * same parameters to prefetch the matching first page — so the hydrated cache
 * and the client query agree by construction instead of by coincidence.
 *
 * `replace` rather than `push`: narrowing a list is not a navigation step, and
 * a back button that walks a filter history would be a surprise. `scroll:
 * false` keeps the operator where they were.
 *
 * Reading is total — an arbitrary, repeated or hand-edited parameter value
 * normalizes to "all" and is never echoed into the DOM.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import {
  normalizeProductFilters,
  toFilterSearchString,
  type ProductCategoryFilter,
  type ProductFilters,
  type ProductStatusFilter,
  PRODUCT_FILTER_PARAMS,
} from '../model/product-filters';

export interface ProductFilterController {
  readonly filters: ProductFilters;
  readonly setStatus: (status: ProductStatusFilter) => void;
  readonly setCategory: (category: ProductCategoryFilter) => void;
}

export function useProductFilters(): ProductFilterController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () =>
      normalizeProductFilters({
        status: searchParams.get(PRODUCT_FILTER_PARAMS.status) ?? undefined,
        category: searchParams.get(PRODUCT_FILTER_PARAMS.category) ?? undefined,
      }),
    [searchParams],
  );

  const apply = useCallback(
    (next: ProductFilters) => {
      const query = toFilterSearchString(next);
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    },
    [pathname, router],
  );

  const setStatus = useCallback(
    (status: ProductStatusFilter) => {
      apply({ ...filters, status });
    },
    [apply, filters],
  );

  const setCategory = useCallback(
    (category: ProductCategoryFilter) => {
      apply({ ...filters, category });
    },
    [apply, filters],
  );

  return { filters, setStatus, setCategory };
}
