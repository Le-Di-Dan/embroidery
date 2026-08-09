'use client';

/**
 * The authoritative Template read.
 *
 * `staleTime: 0` and no window-focus refetch. The first is because a Template's
 * version can change under the operator at any moment and a stale read is
 * exactly the thing that produces an unnecessary conflict; the second is because
 * a refetch triggered by tabbing back would replace the baseline underneath an
 * unsaved draft for no reason the operator asked for.
 *
 * Nothing is retried automatically. The two failures this read can have are a
 * template that does not exist — where asking again cannot change the answer —
 * and a transport failure, where the screen offers an explicit "try again" the
 * operator presses. A hidden retry loop only delays the message they need in
 * order to decide.
 */
import { useQuery } from '@tanstack/react-query';
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

import { designTemplateEditorKeys } from '../model/design-template-editor-keys';
import { classifyLoadFailure, type LoadFailure } from '../model/editor-failure';
import { fetchTemplateDetail } from '../services/design-template-editor.service';

export interface TemplateDetailQuery {
  readonly detail: AdminDesignTemplateDetailResponse | undefined;
  readonly isLoading: boolean;
  readonly failure: LoadFailure | null;
  readonly refetch: () => void;
  /**
   * An awaited re-read, for the conflict reload.
   *
   * The conflict flow needs the answer, not a background refresh: the operator
   * pressed "load the latest version" and the draft is replaced only once that
   * version is actually in hand.
   */
  readonly reload: () => Promise<AdminDesignTemplateDetailResponse | undefined>;
}

export function useTemplateDetailQuery(templateId: string): TemplateDetailQuery {
  const query = useQuery({
    queryKey: designTemplateEditorKeys.detail(templateId),
    queryFn: ({ signal }) => fetchTemplateDetail(templateId, signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    detail: query.data,
    isLoading: query.isPending,
    failure: query.isError ? classifyLoadFailure(query.error) : null,
    refetch: () => {
      void query.refetch();
    },
    reload: async () => (await query.refetch()).data,
  };
}
