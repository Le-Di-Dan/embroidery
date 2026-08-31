'use client';

/**
 * The two unguarded authoring mutations and their cache reconciliation.
 *
 * ## Nothing is optimistic
 *
 * A write can be refused for reasons the client cannot predict — a taken
 * address, a linked product that vanished, a session that expired — so writing
 * the new values into the cache before the response arrives would show the
 * operator a state that never existed. The authoritative response is what lands
 * in the cache, and nothing else.
 *
 * ## Why every success invalidates the list root
 *
 * Creating or editing an entry changes which entries belong in a status-filtered
 * list and where they sit in `display_order`. The root invalidated is
 * `APP11-A01`'s own `galleryListKeys.lists()`, not a literal spelled here: two
 * spellings of one cache key is how an invalidation silently stops matching and
 * an operator returns to a list that still shows the old title.
 *
 * Invalidating the root marks every filtered page stale without discarding the
 * pages themselves, so an operator's accumulated continuation survives.
 *
 * ## Why the detail cache is *set*, not invalidated
 *
 * The response is the complete authoritative record, including the advanced
 * `updatedAt`. Setting it means the very next guarded write uses the token the
 * server just issued; invalidating would leave the screen serving the old
 * record — and the old token — until a refetch landed.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type {
  AdminGalleryEntryDetailResponse,
  CreateGalleryEntryBody,
  UpdateGalleryEntryBody,
} from '@embroidery/api-client';

import { galleryListKeys } from '../../gallery-list';
import { galleryEditorKeys } from '../model/gallery-editor-keys';
import { createGalleryEntry, updateGalleryEntry } from '../services/gallery-entry.service';

export type GalleryCreateMutation = UseMutationResult<
  AdminGalleryEntryDetailResponse,
  Error,
  CreateGalleryEntryBody
>;

export function useGalleryCreateMutation(): GalleryCreateMutation {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateGalleryEntryBody) => createGalleryEntry(body),
    onSuccess: (entry) => {
      // Seed the detail cache so the editor the operator is about to land on
      // renders the record the server just returned instead of refetching what
      // is already known — and holds the right token from its first frame.
      queryClient.setQueryData(galleryEditorKeys.detail(entry.galleryEntryId), entry);
      void queryClient.invalidateQueries({ queryKey: galleryListKeys.lists() });
    },
    // A retry would create a second entry: the operation is not idempotent, and
    // a slug conflict on the second attempt would then hide a first that
    // succeeded.
    retry: false,
  });
}

export interface GalleryUpdateInput {
  readonly entryId: string;
  readonly body: UpdateGalleryEntryBody;
}

export type GalleryUpdateMutation = UseMutationResult<
  AdminGalleryEntryDetailResponse,
  Error,
  GalleryUpdateInput
>;

export function useGalleryUpdateMutation(): GalleryUpdateMutation {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, body }: GalleryUpdateInput) => updateGalleryEntry(entryId, body),
    onSuccess: (entry) => {
      queryClient.setQueryData(galleryEditorKeys.detail(entry.galleryEntryId), entry);
      void queryClient.invalidateQueries({ queryKey: galleryListKeys.lists() });
    },
    retry: false,
  });
}
