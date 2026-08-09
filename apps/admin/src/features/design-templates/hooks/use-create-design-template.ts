'use client';

/**
 * The one command this screen issues.
 *
 * Not optimistic. The server derives the slug, assigns `DRAFT` and decides
 * whether the name collides, so a row written into the cache first could carry
 * a slug the server never minted — and would have to be withdrawn if the create
 * refused. A list is the wrong place to show a template that might not exist.
 *
 * On success the list is **invalidated**, not patched. The response is a detail
 * view and the list holds summaries under filter-and-cursor keys; splicing a row
 * into whichever page happens to be loaded would put it at a position the
 * server's `created_at DESC, id DESC` ordering did not choose, and would leave
 * it there under a filter that excludes it. Refetching from the server is the
 * only way the list stays the list.
 *
 * No detail read follows: the create response already *is* the detail view.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type {
  AdminDesignTemplateDetailResponse,
  CreateDesignTemplateBody,
} from '@embroidery/api-client';

import { designTemplateQueryKeys } from '../model/design-template-query-keys';
import { createTemplate } from '../services/design-template.service';

export type CreateDesignTemplateMutation = UseMutationResult<
  AdminDesignTemplateDetailResponse,
  Error,
  CreateDesignTemplateBody
>;

export function useCreateDesignTemplate(): CreateDesignTemplateMutation {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateDesignTemplateBody) => createTemplate(body),
    onSuccess: () => {
      // Every filter's list, not just the current one: a new DRAFT belongs to
      // the unfiltered page and to the DRAFT page, and the operator may switch
      // to either next.
      void queryClient.invalidateQueries({ queryKey: designTemplateQueryKeys.lists() });
    },
    retry: false,
  });
}
