'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { PublicDesignTemplateSummaryResponse } from '@embroidery/api-client';

import type { StudioPlacementTriple } from '../model/studio-placement';
import { studioQueryKeys } from '../model/studio-query-keys';
import { flattenTemplatePages, nextCursorOf } from '../model/studio-template';
import { fetchTemplatePage } from '../services/studio-template.client';

export interface TemplateListState {
  readonly templates: readonly PublicDesignTemplateSummaryResponse[];
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly isEmpty: boolean;
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly hasContinuationError: boolean;
  readonly loadMore: () => void;
  readonly retry: () => void;
}

const IDLE: TemplateListState = {
  templates: [],
  isLoading: false,
  hasError: false,
  isEmpty: false,
  hasMore: false,
  isLoadingMore: false,
  hasContinuationError: false,
  loadMore: () => undefined,
  retry: () => undefined,
};

/**
 * The published Templates compatible with one exact placement triple
 * (`APP3-B05`).
 *
 * The triple is part of the query key, so a Side or Area change does not
 * *invalidate* this query — it addresses a different one. A response for the
 * previous placement therefore cannot land in the new placement's cache entry
 * however late it arrives, and the cursor sequence restarts because the new key
 * has no pages at all. That is the whole stale-response defence, and it is
 * structural rather than a race a component has to remember to guard.
 *
 * Continuation is keyset. A failed page is **not** retried automatically and
 * never silently restarts from the first page: TanStack replays the exact
 * `pageParam` that failed when the visitor asks again.
 */
export function useTemplateList(triple: StudioPlacementTriple | undefined): TemplateListState {
  const query = useInfiniteQuery({
    queryKey: studioQueryKeys.templateList(
      triple ?? { productId: '', productSideId: '', embroideryAreaId: '' },
    ),
    queryFn: ({ pageParam, signal }) => {
      // Unreachable while `enabled` is false; written as a refusal rather than
      // a non-null assertion so a future edit that enables the query without a
      // triple fails loudly instead of sending three empty ids.
      if (triple === undefined) throw new Error('A template list needs a complete placement.');
      return fetchTemplatePage(triple, pageParam, signal);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursorOf,
    enabled: triple !== undefined,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const pages = query.data?.pages;
  const templates = useMemo(() => flattenTemplatePages(pages ?? []), [pages]);

  if (triple === undefined) return IDLE;

  const hasLoaded = query.data !== undefined;
  return {
    templates,
    isLoading: query.isPending,
    hasError: query.isError && !hasLoaded,
    isEmpty: hasLoaded && templates.length === 0,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    hasContinuationError: query.isFetchNextPageError,
    loadMore: () => {
      if (!query.hasNextPage || query.isFetchingNextPage) return;
      void query.fetchNextPage();
    },
    retry: () => {
      void query.refetch();
    },
  };
}
