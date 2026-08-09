'use client';

/**
 * The Product placement behind a scoped Template.
 *
 * Disabled outright when the Template has no scope. That is what makes "an
 * unscoped Template issues no Product request" a property of the query rather
 * than a rule a component has to remember — and it is the same mechanism that
 * keeps the Side-background request from firing (§17: no scope, no fetch).
 */
import { useQuery } from '@tanstack/react-query';
import type { AdminProductPlacementResponse } from '@embroidery/api-client';

import { designTemplateEditorKeys } from '../model/design-template-editor-keys';
import { fetchProductPlacement } from '../services/template-placement.service';

export interface TemplatePlacementQuery {
  readonly placement: AdminProductPlacementResponse | undefined;
  readonly isLoading: boolean;
  readonly failed: boolean;
  readonly retry: () => void;
}

export function useTemplatePlacementQuery(productId: string | null): TemplatePlacementQuery {
  const query = useQuery({
    queryKey: designTemplateEditorKeys.placement(productId ?? ''),
    queryFn: ({ signal }) => fetchProductPlacement(productId ?? '', signal),
    enabled: productId !== null,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const active = productId !== null;
  return {
    placement: active ? query.data : undefined,
    isLoading: active && query.isPending,
    failed: active && query.isError,
    retry: () => {
      void query.refetch();
    },
  };
}
