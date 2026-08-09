'use client';

/**
 * The one-time initial scope assignment (`APP3-B03B`, consumed here).
 *
 * On success the mutation writes the server's answer straight into the detail
 * cache. That is the whole transition: the screen derives everything it renders
 * from that query, so a Template that now carries a scope simply *is* an
 * editable zero-version Template on the next render. No navigation, no route
 * reopen, and **no second detail read** — `APP3-B03B` returns a full detail view,
 * and asking again would be asking a question already answered.
 *
 * A `409` is never retried. It means another writer got there first, or the
 * Template stopped being assignable; both are answered by re-reading the
 * Template, which the screen does once and then acts on. Forcing the local
 * triple would be a rescope, and no such operation exists.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

import { designTemplateEditorKeys } from '../model/design-template-editor-keys';
import { classifyAssignScopeFailure, type AssignScopeFailure } from '../model/editor-failure';
import {
  assignTemplateScope,
  type AssignTemplateScopeInput,
} from '../services/template-scope.service';

const TEMPLATE_LIST_KEY = ['admin', 'design-templates', 'list'] as const;

export interface AssignTemplateScopeMutation {
  readonly assign: (input: AssignTemplateScopeInput) => void;
  readonly isAssigning: boolean;
}

export interface UseAssignTemplateScopeInput {
  readonly templateId: string;
  readonly onAssigned: (detail: AdminDesignTemplateDetailResponse) => void;
  readonly onFailed: (failure: AssignScopeFailure) => void;
}

export function useAssignTemplateScope({
  templateId,
  onAssigned,
  onFailed,
}: UseAssignTemplateScopeInput): AssignTemplateScopeMutation {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: AssignTemplateScopeInput) => assignTemplateScope(input),
    retry: false,
    onSuccess: (detail) => {
      queryClient.setQueryData(designTemplateEditorKeys.detail(templateId), detail);
      // The list renders a scope column and orders by `updatedAt`; both moved.
      void queryClient.invalidateQueries({ queryKey: TEMPLATE_LIST_KEY });
      onAssigned(detail);
    },
    onError: (error: unknown) => {
      onFailed(classifyAssignScopeFailure(error));
    },
  });

  return {
    assign: (input) => {
      mutation.mutate(input);
    },
    isAssigning: mutation.isPending,
  };
}
