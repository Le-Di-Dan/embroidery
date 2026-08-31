'use client';

import Link from 'next/link';

import { ADMIN_GALLERY_ROUTE } from '../../gallery-list';
import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import type { GalleryDetailFailure } from '../model/gallery-editor-failure';

/**
 * The editor's three non-content states.
 *
 * They are kept apart from the editor itself because they are the whole screen
 * when they happen, not a banner inside it — and because "not found" and "could
 * not load" need different actions. One is a dead link and the only useful move
 * is back to the list; the other is worth retrying, and offering a retry for a
 * record that does not exist would send the operator around a loop that cannot
 * terminate. A session that has expired needs neither: only signing in again
 * can help, so no retry is offered, because none could succeed.
 */

export function GalleryEditorLoading() {
  return (
    <section className="gallery-editor">
      <p className="gallery-editor__status" role="status">
        {GALLERY_EDITOR_COPY.detail.loading}
      </p>
    </section>
  );
}

interface GalleryEditorFailureStateProps {
  readonly failure: GalleryDetailFailure;
  readonly onRetry: () => void;
}

const LOGIN_ROUTE = '/login';

export function GalleryEditorFailureState({ failure, onRetry }: GalleryEditorFailureStateProps) {
  const copy = GALLERY_EDITOR_COPY.detail;

  if (failure === 'unauthenticated') {
    return (
      <section className="gallery-editor">
        <div className="gallery-editor__failure" role="alert" data-testid="gallery-editor-expired">
          <p className="gallery-editor__failure-title">{copy.unauthenticatedTitle}</p>
          <p className="gallery-editor__failure-body">{copy.unauthenticatedBody}</p>
          <Link className="gallery-editor__secondary" href={LOGIN_ROUTE}>
            {copy.signIn}
          </Link>
        </div>
      </section>
    );
  }

  if (failure === 'not-found') {
    return (
      <section className="gallery-editor">
        <div
          className="gallery-editor__failure"
          role="alert"
          data-testid="gallery-editor-not-found"
        >
          <p className="gallery-editor__failure-title">{copy.notFoundTitle}</p>
          <p className="gallery-editor__failure-body">{copy.notFoundBody}</p>
          <Link className="gallery-editor__secondary" href={ADMIN_GALLERY_ROUTE}>
            {copy.backToList}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="gallery-editor">
      <div
        className="gallery-editor__failure"
        role="alert"
        data-testid="gallery-editor-unavailable"
      >
        <p className="gallery-editor__failure-title">{copy.unavailableTitle}</p>
        <p className="gallery-editor__failure-body">{copy.unavailableBody}</p>
        <button type="button" className="gallery-editor__secondary" onClick={onRetry}>
          {copy.retry}
        </button>
      </div>
    </section>
  );
}
