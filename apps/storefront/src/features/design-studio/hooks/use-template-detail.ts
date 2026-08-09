'use client';

import { useQuery } from '@tanstack/react-query';

import type { PublicDesignTemplateDetailResponse } from '@embroidery/api-client';

import { classifyStudioFailure, type StudioFailure } from '../model/studio-failure';
import type { StudioPlacementTriple } from '../model/studio-placement';
import { studioQueryKeys } from '../model/studio-query-keys';
import { fetchTemplateDetail } from '../services/studio-template.client';

export interface TemplateDetailState {
  readonly detail: PublicDesignTemplateDetailResponse | undefined;
  readonly isLoading: boolean;
  readonly failure: StudioFailure | null;
}

/**
 * The selected Template's published version and document (`APP3-B05`).
 *
 * One read for the **one** selected Template. Nothing here reads a detail per
 * listed row: the list already carries what a row renders, and a read per row
 * would be the N+1 a keyset list exists to avoid.
 *
 * The key carries the placement triple as well as the slug. A Template's public
 * visibility depends on its Product, Side and Area still being designable, so a
 * detail cached under the slug alone could outlive the context that authorised
 * it.
 *
 * A `gone` failure is the interesting one: the Template was listed and has since
 * been unpublished, archived or had its placement withdrawn. The caller clears
 * the selection and offers a reselection — it never quietly converts the choice
 * into a blank start, because the visitor chose a Template.
 */
export function useTemplateDetail(
  triple: StudioPlacementTriple | undefined,
  templateSlug: string | null,
): TemplateDetailState {
  const enabled = triple !== undefined && templateSlug !== null;

  const query = useQuery({
    queryKey: studioQueryKeys.templateDetail(
      triple ?? { productId: '', productSideId: '', embroideryAreaId: '' },
      templateSlug ?? '',
    ),
    queryFn: ({ signal }) => {
      if (templateSlug === null) throw new Error('A template detail needs a selected template.');
      return fetchTemplateDetail(templateSlug, signal);
    },
    enabled,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!enabled) return { detail: undefined, isLoading: false, failure: null };

  return {
    detail: query.data,
    isLoading: query.isPending,
    failure: query.isError ? classifyStudioFailure(query.error) : null,
  };
}
