'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AdminGalleryEntryDetailResponseStatus } from '@embroidery/api-client';
import type { AdminGalleryEntryDetailResponse } from '@embroidery/api-client';

import { ADMIN_GALLERY_ROUTE } from '../../gallery-list';
import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import { useGalleryEditorState } from '../hooks/use-gallery-editor-state';
import { useGalleryUnsavedChanges } from '../hooks/use-gallery-unsaved-changes';
import { GalleryAuthoringForm } from './gallery-authoring-form';
import { GalleryConflictDialog, GalleryUnsavedDialog } from './gallery-confirm-dialogs';
import { GalleryMediaSection } from './gallery-media-section';
import { GalleryPublicationPanel } from './gallery-publication-panel';

interface GalleryEditorWorkspaceProps {
  readonly entry: AdminGalleryEntryDetailResponse;
  /** Refetches the authoritative record, restoring a fresh concurrency token. */
  readonly onReload: () => void;
}

/**
 * The editor for one loaded entry (`868:909` desktop, `870:1368` mobile).
 *
 * Composition and markup only: the state, the diffs and every command live in
 * `useGalleryEditorState`, so this file holds no rule about what a save sends
 * or when a command is allowed.
 *
 * ## One `<h1>`, and it is the entry
 *
 * The page's heading is the entry's title, because that is what the screen is
 * about. The three panels below carry `<h2>`s and are labelled sections, so the
 * structure is navigable rather than a flat run of controls.
 *
 * ## The back link routes through the guard
 *
 * Leaving with unsaved work opens the approved dialog rather than the browser's
 * — the same decision an operator gets from a shell navigation entry, which
 * reaches the same interceptor through the shared navigation guard.
 *
 * ## Media is read-only for an archived entry
 *
 * The lifecycle service permits a media change only from `DRAFT` or
 * `PUBLISHED`. An archived entry's save would therefore be refused, and refused
 * as a *version conflict* — which would tell the operator to reload, and
 * reloading would not help. So the section says plainly that an archived
 * entry's images are fixed, and offers no save to be refused.
 */
export function GalleryEditorWorkspace({ entry, onReload }: GalleryEditorWorkspaceProps) {
  const router = useRouter();
  const state = useGalleryEditorState(entry);
  const guard = useGalleryUnsavedChanges(state.dirty);

  const archived = entry.status === AdminGalleryEntryDetailResponseStatus.ARCHIVED;

  return (
    <section className="gallery-editor">
      <header className="gallery-editor__header">
        <p className="gallery-editor__breadcrumb">{GALLERY_EDITOR_COPY.detail.breadcrumb}</p>
        <h1 className="gallery-editor__title">{entry.title}</h1>
        <Link
          className="gallery-editor__back"
          href={ADMIN_GALLERY_ROUTE}
          onClick={(event) => {
            // Routed through the guard rather than followed directly, so the
            // approved dialog — not the browser's — owns the decision.
            event.preventDefault();
            guard.requestNavigation(() => router.push(ADMIN_GALLERY_ROUTE));
          }}
        >
          {GALLERY_EDITOR_COPY.detail.backToList}
        </Link>
      </header>

      <div className="gallery-editor__body">
        <div className="gallery-editor__column">
          <GalleryAuthoringForm
            values={state.authoring}
            slug={entry.slug}
            errors={state.authoringErrors}
            showErrors={state.showAuthoringErrors}
            dirty={state.authoringDirty}
            saving={state.authoringSaving}
            failure={state.authoringFailure}
            onChange={state.patchAuthoring}
            onSubmit={state.saveAuthoring}
            onDiscard={state.discardAuthoring}
          />

          <GalleryMediaSection
            entryTitle={entry.title}
            selection={state.selection}
            dirty={state.mediaDirty}
            saving={state.mediaSaving}
            locked={archived}
            failure={state.mediaFailure}
            onChange={state.changeSelection}
            onSave={state.saveSelection}
            onDiscard={state.discardSelection}
          />
        </div>

        <aside className="gallery-editor__rail">
          <GalleryPublicationPanel
            entry={entry}
            hasUnsavedChanges={state.dirty}
            pending={state.publicationPending}
            flagged={state.flaggedRequirements}
            failure={state.publicationFailure}
            outcome={state.publicationOutcome}
            onPublish={state.publish}
            onUnpublish={state.unpublish}
          />
        </aside>
      </div>

      {state.conflict ? (
        <GalleryConflictDialog
          hasUnsavedChanges={state.dirty}
          onClose={state.dismissConflict}
          onReload={() => {
            state.dismissConflict();
            onReload();
          }}
        />
      ) : null}

      {guard.prompting ? (
        <GalleryUnsavedDialog onLeave={guard.confirmLeave} onStay={guard.cancelLeave} />
      ) : null}
    </section>
  );
}
