'use client';

/**
 * The Template's scope chain, resolved against the Product's authoritative
 * placement — the same read `APP3-A03` performs, on the same cache root.
 *
 * This is what lets four of the seven readiness rows be answered honestly rather
 * than deferred. It reproduces the server's `resolveScope` **shape**, not its
 * policy: the Side must exist and not be retired, the Area must exist, not be
 * retired, and hang from *that* Side. Every one of those is a fact the placement
 * response already states; none of it is a second definition of anything.
 *
 * Three return states, deliberately, because two would lie. `undefined` means
 * *not read yet* — the query is disabled without a scope, and a Product request
 * must not fire for a Template that has none. `null` means the chain genuinely
 * does not resolve. A resolved chain is the third.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { designTemplateEditorKeys } from '../../design-template-editor';
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

import { fetchScopePlacement } from '../services/design-template-scope.service';
import type { ResolvedScopeAuthority } from '../model/lifecycle-readiness';

export interface ScopeAuthorityQuery {
  readonly scope: ResolvedScopeAuthority | null | undefined;
  readonly isLoading: boolean;
}

export function useScopeAuthority(
  detail: AdminDesignTemplateDetailResponse | undefined,
): ScopeAuthorityQuery {
  const productId = detail?.scope?.productId ?? null;

  const query = useQuery({
    queryKey: designTemplateEditorKeys.placement(productId ?? ''),
    queryFn: ({ signal }) => fetchScopePlacement(productId ?? '', signal),
    enabled: productId !== null,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const scope = useMemo<ResolvedScopeAuthority | null | undefined>(() => {
    const templateScope = detail?.scope;
    if (templateScope === undefined) return undefined;
    if (query.isPending) return undefined;
    if (query.isError || query.data === undefined) return null;

    const placement = query.data;
    // Matched by **id**, never by name, code or position: a Side matched by name
    // silently follows a rename, and a Side matched by position silently follows
    // a reorder. The same rule `APP3-A03` resolves its scope under.
    const side = placement.sides.find((row) => row.id === templateScope.productSideId);
    if (side === undefined || side.retiredAt != null) return null;

    // Read from the chosen Side's own list, so an Area belonging to a sibling
    // Side is unreachable rather than filtered out.
    const area = side.areas.find((row) => row.id === templateScope.embroideryAreaId);
    if (area === undefined || area.retiredAt != null) return null;

    const pxPerMm = Number(side.pxPerMm);
    const boundWidthPx = Number(area.boundWidthPx);
    const boundHeightPx = Number(area.boundHeightPx);

    return {
      side: {
        productSideId: side.id,
        code: side.code,
        retiredAt: null,
        imageWidthPx: side.imageWidthPx,
        imageHeightPx: side.imageHeightPx,
        physicalWidthMm: Number(side.physicalWidthMm),
        physicalHeightMm: Number(side.physicalHeightMm),
        pxPerMm,
      },
      area: {
        embroideryAreaId: area.id,
        productSideId: side.id,
        code: area.code,
        retiredAt: null,
        boundXPx: Number(area.boundXPx),
        boundYPx: Number(area.boundYPx),
        boundWidthPx,
        boundHeightPx,
        // Absent mm caps mean "no cap beyond the area itself", exactly as the
        // server reads them. A zero would reject every document.
        maxWidthMm: area.maxWidthMm == null ? boundWidthPx / pxPerMm : Number(area.maxWidthMm),
        maxHeightMm: area.maxHeightMm == null ? boundHeightPx / pxPerMm : Number(area.maxHeightMm),
      },
      // Side and Area only. No accepted read this screen performs carries the
      // Product's display name, and fetching one to complete a label would add a
      // consumer for a caption. The ids are the identity; these are the copy.
      sideName: side.name,
      areaName: area.name,
    };
  }, [detail?.scope, query.data, query.isError, query.isPending]);

  return { scope, isLoading: productId !== null && query.isPending };
}
