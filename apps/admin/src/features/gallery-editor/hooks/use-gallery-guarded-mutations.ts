'use client';

/**
 * The three **guarded** mutations: the ordered media replacement and the two
 * publication transitions.
 *
 * ## The token always comes from the cache, and always advances
 *
 * Each command carries the `expectedUpdatedAt` the caller read from the
 * authoritative record, and each success replaces that record with the response
 * — which is what refreshes the token for the next command. No token is
 * remembered anywhere else, so there is no second copy to go stale, and a
 * command composed from a status the operator saw and a token they did not is
 * not expressible.
 *
 * ## `retry: false` is a correctness rule here, not a preference
 *
 * An automatic retry would re-send the same `expectedUpdatedAt`. After a
 * conflict that token is known-stale, so a retry could only fail again — or,
 * worse, succeed against a window the operator never saw. A stale mutation is
 * never replayed; the screen reports it and offers a reload the operator
 * chooses.
 *
 * ## Nothing is optimistic, least of all publication
 *
 * The server recomputes readiness inside its own transaction from persisted
 * state, so a publish the screen believed was certain can still be refused.
 * Writing `PUBLISHED` into the cache first would show the operator a lifecycle
 * state the entry never entered, which is the one thing a publication panel
 * must never do.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { AdminGalleryEntryDetailResponse } from '@embroidery/api-client';

import { galleryListKeys } from '../../gallery-list';
import { galleryEditorKeys } from '../model/gallery-editor-keys';
import {
  publishGalleryEntry,
  replaceGalleryEntryAssets,
  unpublishGalleryEntry,
  type GuardedGalleryCommand,
  type ReplaceGalleryAssetsCommand,
} from '../services/gallery-publication.service';

type GuardedMutation<TInput> = UseMutationResult<AdminGalleryEntryDetailResponse, Error, TInput>;

function useReconciler(): (entry: AdminGalleryEntryDetailResponse) => void {
  const queryClient = useQueryClient();
  return (entry) => {
    queryClient.setQueryData(galleryEditorKeys.detail(entry.galleryEntryId), entry);
    void queryClient.invalidateQueries({ queryKey: galleryListKeys.lists() });
  };
}

export type GalleryReplaceAssetsMutation = GuardedMutation<ReplaceGalleryAssetsCommand>;

export function useGalleryReplaceAssetsMutation(): GalleryReplaceAssetsMutation {
  const reconcile = useReconciler();
  return useMutation({
    mutationFn: (command: ReplaceGalleryAssetsCommand) => replaceGalleryEntryAssets(command),
    onSuccess: reconcile,
    retry: false,
  });
}

export type GalleryPublicationMutation = GuardedMutation<GuardedGalleryCommand>;

export function useGalleryPublishMutation(): GalleryPublicationMutation {
  const reconcile = useReconciler();
  return useMutation({
    mutationFn: (command: GuardedGalleryCommand) => publishGalleryEntry(command),
    onSuccess: reconcile,
    retry: false,
  });
}

export function useGalleryUnpublishMutation(): GalleryPublicationMutation {
  const reconcile = useReconciler();
  return useMutation({
    mutationFn: (command: GuardedGalleryCommand) => unpublishGalleryEntry(command),
    onSuccess: reconcile,
    retry: false,
  });
}
