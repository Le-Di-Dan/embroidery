'use client';

/**
 * The authoritative Template read behind the lifecycle screen.
 *
 * Rooted on the **same** cache identity the editor uses
 * (`designTemplateEditorKeys.detail`), because the two screens are looking at
 * one Template. A publish performed here must be what the editor sees when the
 * operator navigates back, and the `expectedCurrentVersion` both send is this
 * entry's version — two key spellings would give one Template two private
 * truths, which is precisely what the concurrency token exists to prevent.
 *
 * `staleTime: 0` and no window-focus refetch, for the reason the editor has: the
 * version can move under the operator at any moment, and a stale read is exactly
 * what produces an unnecessary conflict. Nothing retries automatically — a
 * missing Template will not appear on a second ask, and a transport failure
 * offers the operator an explicit retry instead of a hidden loop.
 */
import { useQuery } from '@tanstack/react-query';
import { designTemplateEditorKeys } from '../../design-template-editor';
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

import { classifyLifecycleFailure, type LifecycleFailure } from '../model/lifecycle-failure';
import { fetchLifecycleDetail } from '../services/design-template-lifecycle.service';

export interface LifecycleDetailQuery {
  readonly detail: AdminDesignTemplateDetailResponse | undefined;
  readonly isLoading: boolean;
  readonly failure: LifecycleFailure | null;
  readonly retry: () => void;
}

export function useLifecycleDetailQuery(templateId: string): LifecycleDetailQuery {
  const query = useQuery({
    queryKey: designTemplateEditorKeys.detail(templateId),
    queryFn: ({ signal }) => fetchLifecycleDetail(templateId, signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    detail: query.data,
    isLoading: query.isPending,
    failure: query.isError ? classifyLifecycleFailure(query.error) : null,
    retry: () => {
      void query.refetch();
    },
  };
}
