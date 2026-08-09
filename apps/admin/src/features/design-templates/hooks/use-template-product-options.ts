'use client';

/**
 * The Products offered by the toolbar's Product filter.
 *
 * `APP3-B03` filters by `productId`, so the filter is real — but the operator
 * picks a *name*, and the Template list carries only ids. One bounded page of
 * `adminProduct_list` supplies those names.
 *
 * **One request for the whole screen, never one per row.** The same map also
 * resolves the Product name in the scope column, so a scoped row costs nothing
 * extra. A row whose Product is outside this page states that a scope exists
 * without inventing a label — resolving it would be the N+1 the keyset list is
 * built to avoid (`APP3-A02` §9).
 *
 * Failure is **not** propagated to the screen. The Product filter is a
 * convenience; the Template list is the capability. If products cannot be
 * listed, the filter degrades to "all products" with a stated reason and the
 * list still works.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { adminProductList, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminProductSummaryResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { DesignTemplateApiError } from '../model/design-template-failure';
import { designTemplateQueryKeys } from '../model/design-template-query-keys';

/** One page is enough to name the products an operator filters by. */
export const TEMPLATE_PRODUCT_OPTION_PAGE_SIZE = 100;

export interface TemplateProductOptions {
  readonly options: readonly AdminProductSummaryResponse[];
  /** `productId → name`, for the filter and the scope column alike. */
  readonly names: ReadonlyMap<string, string>;
  readonly unavailable: boolean;
}

async function fetchProductOptions(
  signal?: AbortSignal,
): Promise<readonly AdminProductSummaryResponse[]> {
  try {
    const response = await adminProductList(
      { limit: TEMPLATE_PRODUCT_OPTION_PAGE_SIZE },
      {
        instance: getBrowserApiClient(),
        ...(signal === undefined ? {} : { config: { signal } }),
      },
    );
    return response.data.items;
  } catch (error: unknown) {
    throw new DesignTemplateApiError(normalizeApiClientError(error));
  }
}

export function useTemplateProductOptions(): TemplateProductOptions {
  const query: UseQueryResult<readonly AdminProductSummaryResponse[], Error> = useQuery({
    queryKey: [...designTemplateQueryKeys.all, 'product-options'] as const,
    queryFn: ({ signal }) => fetchProductOptions(signal),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const options = query.data ?? [];
  const names = new Map(options.map((product) => [product.productId, product.name]));

  return { options, names, unavailable: query.isError };
}
