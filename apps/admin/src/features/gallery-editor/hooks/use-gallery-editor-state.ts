'use client';

/**
 * The editor's local state and every command it can issue, in one controller.
 *
 * The screen below it is composition and markup; everything that decides *what
 * a save sends* and *when a command is allowed* is here, so those rules can be
 * read — and tested — without a DOM.
 *
 * ## Two independent kinds of unsaved work
 *
 * Authoring edits and the media arrangement are separate: they are separate
 * operations with separate bodies, one guarded by a concurrency token and one
 * not, and an operator can legitimately have either without the other. So they
 * have separate dirty flags, separate saves and separate failure banners — and
 * the navigation guard takes their disjunction, because protecting one and not
 * the other would silently discard exactly the half that was not checked.
 *
 * ## The token is read at command time, from the authoritative record
 *
 * Never remembered, never carried in local state. Every successful command
 * replaces the cached record with the response, so the next command reads the
 * token the server just issued. A stale-token refusal is reported and never
 * replayed: re-sending the same token could only fail again, or succeed against
 * a window the operator never saw.
 *
 * ## Seeding cannot register a change
 *
 * Both dirty flags diff against the record the state was seeded from. The seed
 * is re-taken only when the authoritative record's identity or token changes,
 * so hydration is never mistaken for an edit — and a reload after a conflict
 * genuinely resets the baseline the next diff is computed from.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminGalleryEntryDetailResponse } from '@embroidery/api-client';

import {
  authoringValuesFromDetail,
  buildGalleryUpdateBody,
  hasGalleryAuthoringErrors,
  isGalleryAuthoringDirty,
  validateGalleryAuthoring,
  type GalleryAuthoringErrors,
  type GalleryAuthoringValues,
} from '../model/gallery-authoring-values';
import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import {
  classifyAuthoringFailure,
  classifyMediaSaveFailure,
  classifyPublicationFailure,
  isVersionConflict,
  publicationRequirementCodes,
} from '../model/gallery-editor-failure';
import { GALLERY_MEDIA_COPY } from '../model/gallery-media-copy';
import { hasSelectionChanged, selectionFromDetailAssets } from '../model/gallery-media-selection';
import {
  requirementsFromDetailCodes,
  type GalleryPublicationRequirement,
} from '../model/gallery-readiness';
import { useGalleryUpdateMutation } from './use-gallery-entry-mutations';
import {
  useGalleryPublishMutation,
  useGalleryReplaceAssetsMutation,
  useGalleryUnpublishMutation,
} from './use-gallery-guarded-mutations';

export interface FailureBanner {
  readonly title: string;
  readonly body: string;
}

export interface GalleryEditorState {
  readonly authoring: GalleryAuthoringValues;
  readonly authoringErrors: GalleryAuthoringErrors;
  readonly showAuthoringErrors: boolean;
  readonly authoringDirty: boolean;
  readonly authoringSaving: boolean;
  readonly authoringFailure: FailureBanner | null;
  readonly selection: readonly string[];
  readonly mediaDirty: boolean;
  readonly mediaSaving: boolean;
  readonly mediaFailure: FailureBanner | null;
  readonly publicationPending: boolean;
  readonly publicationFailure: FailureBanner | null;
  readonly publicationOutcome: string | null;
  readonly flaggedRequirements: readonly GalleryPublicationRequirement[];
  readonly dirty: boolean;
  readonly conflict: boolean;
  readonly patchAuthoring: (patch: Partial<GalleryAuthoringValues>) => void;
  readonly discardAuthoring: () => void;
  readonly saveAuthoring: () => void;
  readonly changeSelection: (selection: readonly string[]) => void;
  readonly discardSelection: () => void;
  readonly saveSelection: () => void;
  readonly publish: () => void;
  readonly unpublish: () => void;
  readonly dismissConflict: () => void;
}

export function useGalleryEditorState(entry: AdminGalleryEntryDetailResponse): GalleryEditorState {
  const [authoring, setAuthoring] = useState(() => authoringValuesFromDetail(entry));
  const [selection, setSelection] = useState(() => selectionFromDetailAssets(entry.assets));
  const [showAuthoringErrors, setShowAuthoringErrors] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [publicationOutcome, setPublicationOutcome] = useState<string | null>(null);
  const [flaggedRequirements, setFlagged] = useState<readonly GalleryPublicationRequirement[]>([]);

  // The baseline both diffs are computed against. Re-seeded when the
  // authoritative record moves — a save, a command, a reload after a conflict —
  // and never on an ordinary re-render, so hydration is not an edit.
  const seed = useRef({
    key: `${entry.galleryEntryId}:${entry.updatedAt}`,
    authoring: authoringValuesFromDetail(entry),
    selection: selectionFromDetailAssets(entry.assets),
  });

  useEffect(() => {
    const key = `${entry.galleryEntryId}:${entry.updatedAt}`;
    if (seed.current.key === key) {
      return;
    }
    const next = {
      key,
      authoring: authoringValuesFromDetail(entry),
      selection: selectionFromDetailAssets(entry.assets),
    };
    seed.current = next;
    setAuthoring(next.authoring);
    setSelection(next.selection);
    setShowAuthoringErrors(false);
  }, [entry]);

  const update = useGalleryUpdateMutation();
  const replaceAssets = useGalleryReplaceAssetsMutation();
  const publishMutation = useGalleryPublishMutation();
  const unpublishMutation = useGalleryUnpublishMutation();

  const authoringErrors = validateGalleryAuthoring(
    authoring,
    GALLERY_EDITOR_COPY.authoring.validation,
  );
  const authoringDirty = isGalleryAuthoringDirty(seed.current.authoring, authoring);
  const mediaDirty = hasSelectionChanged(seed.current.selection, selection);

  const onGuardedError = useCallback((error: unknown) => {
    if (isVersionConflict(error)) {
      setConflict(true);
      return true;
    }
    return false;
  }, []);

  const saveAuthoring = useCallback(() => {
    setShowAuthoringErrors(true);
    if (hasGalleryAuthoringErrors(authoringErrors)) {
      return;
    }
    const body = buildGalleryUpdateBody(seed.current.authoring, authoring);
    if (body === null) {
      return;
    }
    setPublicationOutcome(null);
    update.mutate({ entryId: entry.galleryEntryId, body });
  }, [authoring, authoringErrors, entry.galleryEntryId, update]);

  const saveSelection = useCallback(() => {
    setPublicationOutcome(null);
    replaceAssets.mutate(
      {
        entryId: entry.galleryEntryId,
        // The token as the authoritative record currently carries it, read at
        // command time rather than captured when the arrangement was made.
        expectedUpdatedAt: entry.updatedAt,
        assetIds: selection,
      },
      { onError: onGuardedError },
    );
  }, [entry.galleryEntryId, entry.updatedAt, onGuardedError, replaceAssets, selection]);

  const runCommand = useCallback(
    (mutation: typeof publishMutation, confirmation: string) => {
      setPublicationOutcome(null);
      setFlagged([]);
      mutation.mutate(
        { entryId: entry.galleryEntryId, expectedUpdatedAt: entry.updatedAt },
        {
          onSuccess: () => setPublicationOutcome(confirmation),
          onError: (error) => {
            if (onGuardedError(error)) {
              return;
            }
            // The server named the requirements it objected to; they are used to
            // emphasise rows the panel renders from the refetched record, never
            // to author a message.
            setFlagged(requirementsFromDetailCodes(publicationRequirementCodes(error)));
          },
        },
      );
    },
    [entry.galleryEntryId, entry.updatedAt, onGuardedError, publishMutation],
  );

  return {
    authoring,
    authoringErrors,
    showAuthoringErrors,
    authoringDirty,
    authoringSaving: update.isPending,
    authoringFailure:
      update.isError && !conflict
        ? GALLERY_EDITOR_COPY.authoring.failure[classifyAuthoringFailure(update.error)]
        : null,
    selection,
    mediaDirty,
    mediaSaving: replaceAssets.isPending,
    mediaFailure:
      replaceAssets.isError && !conflict
        ? GALLERY_MEDIA_COPY.failure.save[classifyMediaSaveFailure(replaceAssets.error)]
        : null,
    publicationPending: publishMutation.isPending || unpublishMutation.isPending,
    publicationFailure: conflict
      ? null
      : publishMutation.isError
        ? GALLERY_EDITOR_COPY.publication.failure[classifyPublicationFailure(publishMutation.error)]
        : unpublishMutation.isError
          ? GALLERY_EDITOR_COPY.publication.failure[
              classifyPublicationFailure(unpublishMutation.error)
            ]
          : null,
    publicationOutcome,
    flaggedRequirements,
    dirty: authoringDirty || mediaDirty,
    conflict,
    patchAuthoring: (patch) => setAuthoring((current) => ({ ...current, ...patch })),
    discardAuthoring: () => {
      setAuthoring(seed.current.authoring);
      setShowAuthoringErrors(false);
    },
    saveAuthoring,
    changeSelection: setSelection,
    discardSelection: () => setSelection(seed.current.selection),
    saveSelection,
    publish: () => runCommand(publishMutation, GALLERY_EDITOR_COPY.publication.published),
    unpublish: () => runCommand(unpublishMutation, GALLERY_EDITOR_COPY.publication.unpublished),
    dismissConflict: () => setConflict(false),
  };
}
