'use client';

/**
 * The one write this screen performs.
 *
 * On success the mutation writes the server's answer into the detail cache
 * itself, so the new version, the new `updatedAt` and the canonical document are
 * all in place **without a second read**. `APP3-B03A`'s response is a full
 * detail view; issuing a `GET` after it would be asking a question already
 * answered, and would open a window in which the cache and the editor disagree.
 *
 * The list cache is invalidated rather than patched: a save changes `updatedAt`,
 * which is the list's ordering key, so where the row belongs is the server's
 * answer to give.
 *
 * A failed save is never retried automatically. A stale-version conflict least
 * of all — the same `expectedCurrentVersion` would earn the same refusal, and a
 * silent retry is how "the server was not overwritten" stops being true.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

import { designTemplateEditorKeys } from '../model/design-template-editor-keys';
import {
  classifySaveFailure,
  type SaveFailure,
  type UnresolvedConflict,
} from '../model/editor-failure';
import {
  saveTemplateDocument,
  type SaveTemplateDocumentInput,
} from '../services/design-template-editor.service';

const TEMPLATE_LIST_KEY = ['admin', 'design-templates', 'list'] as const;

export interface SaveTemplateDocumentMutation {
  readonly save: (input: SaveTemplateDocumentInput) => void;
  readonly isSaving: boolean;
}

export interface UseSaveTemplateDocumentInput {
  readonly templateId: string;
  readonly onSaved: (detail: AdminDesignTemplateDetailResponse) => void;
  readonly onFailed: (failure: SaveFailure | UnresolvedConflict) => void;
}

export function useSaveTemplateDocument({
  templateId,
  onSaved,
  onFailed,
}: UseSaveTemplateDocumentInput): SaveTemplateDocumentMutation {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: SaveTemplateDocumentInput) => saveTemplateDocument(input),
    retry: false,
    onSuccess: (detail) => {
      queryClient.setQueryData(designTemplateEditorKeys.detail(templateId), detail);
      void queryClient.invalidateQueries({ queryKey: TEMPLATE_LIST_KEY });
      onSaved(detail);
    },
    onError: (error: unknown) => {
      onFailed(classifySaveFailure(error));
    },
  });

  return {
    save: (input) => {
      mutation.mutate(input);
    },
    isSaving: mutation.isPending,
  };
}
