'use client';

/**
 * The filter state, held in the URL rather than in a component.
 *
 * The same convention `APP2-A02` set for the product list, chosen for the same
 * reason: a filtered list is a place the operator can bookmark, reload and
 * share. Following the established precedent is the point — a second way to
 * hold Admin list filters would make the two screens behave differently for no
 * reason (`APP3-A02` §17).
 *
 * `replace` rather than `push`: narrowing a list is not a navigation step, and a
 * back button that walked a filter history would be a surprise. `scroll: false`
 * keeps the operator where they were.
 *
 * Reading is total — an arbitrary, repeated or hand-edited parameter normalizes
 * to "all" and is never echoed into the DOM.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import {
  normalizeTemplateFilters,
  toFilterSearchString,
  TEMPLATE_FILTER_PARAMS,
  type DesignTemplateFilters,
  type TemplateProductFilter,
  type TemplateStatusFilter,
} from '../model/design-template-filters';

export interface DesignTemplateFilterController {
  readonly filters: DesignTemplateFilters;
  readonly setStatus: (status: TemplateStatusFilter) => void;
  readonly setProduct: (productId: TemplateProductFilter) => void;
}

export function useDesignTemplateFilters(): DesignTemplateFilterController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () =>
      normalizeTemplateFilters({
        status: searchParams.get(TEMPLATE_FILTER_PARAMS.status) ?? undefined,
        productId: searchParams.get(TEMPLATE_FILTER_PARAMS.productId) ?? undefined,
      }),
    [searchParams],
  );

  const apply = useCallback(
    (next: DesignTemplateFilters) => {
      const query = toFilterSearchString(next);
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    },
    [pathname, router],
  );

  const setStatus = useCallback(
    (status: TemplateStatusFilter) => {
      apply({ ...filters, status });
    },
    [apply, filters],
  );

  const setProduct = useCallback(
    (productId: TemplateProductFilter) => {
      apply({ ...filters, productId });
    },
    [apply, filters],
  );

  return { filters, setStatus, setProduct };
}
