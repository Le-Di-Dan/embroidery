'use client';

import { classifyDetailFailure } from '../model/gallery-editor-failure';
import { useGalleryEntryDetailQuery } from '../hooks/use-gallery-entry-detail-query';
import { GalleryEditorFailureState, GalleryEditorLoading } from './gallery-editor-states';
import { GalleryEditorWorkspace } from './gallery-editor-workspace';

interface GalleryEditorScreenProps {
  readonly entryId: string;
}

/**
 * `/gallery/[entryId]` — the load boundary for the gallery editor.
 *
 * The four states are derived from the query alone, never from a local flag:
 * loading, session expired, not found, and unavailable. "Not found" is
 * distinguished from a generic failure because the two need different actions —
 * one is a dead link, the other is worth retrying.
 *
 * An `ARCHIVED` entry renders the editor rather than a 404 or a refusal: it
 * exists, an operator may legitimately have followed a link to it, and the
 * authoring PATCH genuinely accepts it. What it cannot do — change its images,
 * publish, unpublish — the workspace states and does not offer.
 */
export function GalleryEditorScreen({ entryId }: GalleryEditorScreenProps) {
  const query = useGalleryEntryDetailQuery(entryId);

  if (query.isPending) {
    return <GalleryEditorLoading />;
  }

  if (query.isError) {
    return (
      <GalleryEditorFailureState
        failure={classifyDetailFailure(query.error)}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  return (
    <GalleryEditorWorkspace
      entry={query.data}
      onReload={() => {
        void query.refetch();
      }}
    />
  );
}
