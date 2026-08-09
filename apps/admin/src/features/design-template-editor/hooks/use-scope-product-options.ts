'use client';

/**
 * The Products the initial scope selector offers.
 *
 * One bounded page of the repository's accepted Admin Product operation. There
 * is no Product search here because `adminProduct_list` publishes none for this
 * purpose — offering a search box the contract cannot answer is the dead control
 * `APP3-A02` was careful not to ship, and the same rule applies to a selector.
 *
 * Disabled unless the Template is actually assignable. That is what keeps a
 * merely-browsing editor — a scoped Template, a versioned one, a phone — from
 * issuing a Product request it has no use for.
 */
import { useQuery } from '@tanstack/react-query';
import type { AdminProductSummaryResponse } from '@embroidery/api-client';

import { designTemplateEditorKeys } from '../model/design-template-editor-keys';
import { fetchScopeProductOptions } from '../services/template-scope.service';

export interface ScopeProductOptions {
  readonly products: readonly AdminProductSummaryResponse[];
  readonly isLoading: boolean;
  readonly failed: boolean;
  readonly retry: () => void;
}

export function useScopeProductOptions(enabled: boolean): ScopeProductOptions {
  const query = useQuery({
    queryKey: designTemplateEditorKeys.productOptions(),
    queryFn: ({ signal }) => fetchScopeProductOptions(signal),
    enabled,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    products: enabled ? (query.data ?? []) : [],
    isLoading: enabled && query.isPending,
    failed: enabled && query.isError,
    retry: () => {
      void query.refetch();
    },
  };
}
