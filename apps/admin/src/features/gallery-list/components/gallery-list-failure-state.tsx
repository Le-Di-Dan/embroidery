'use client';

import Link from 'next/link';

import { LOGIN_ROUTE } from '../../../config/routes';
import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';
import type { GalleryListFailure } from '../model/gallery-list-failure';

interface GalleryListFailureStateProps {
  readonly failure: GalleryListFailure;
  readonly onRetry: () => void;
}

/**
 * Why the list could not be read.
 *
 * Each state carries a Vietnamese title and an action sentence. Nothing here
 * renders the server's `message`, `code` or `requestId`, and nothing renders a
 * status number: the classification picks the sentence, so no server prose, SQL
 * fragment, storage fact or stack can reach the screen.
 *
 * The offered action follows what the failure actually permits:
 *
 * - **unauthenticated** — nothing but signing in again will help, so no retry
 *   is offered. There is none that could succeed.
 * - **retryable** — the sanitised platform failure, the one band where a second
 *   attempt can genuinely differ. The body states that nothing was changed,
 *   because a failed read changes nothing and an operator should not be left
 *   wondering.
 *
 * A failure is never rendered as an empty list. "Chưa có mục bộ sưu tập" while
 * nothing is known would be a claim about the gallery this screen cannot make.
 */
export function GalleryListFailureState({ failure, onRetry }: GalleryListFailureStateProps) {
  if (failure === 'unauthenticated') {
    return (
      <section
        className="gallery-panel gallery-panel--warning"
        role="alert"
        data-testid="gallery-list-error"
      >
        <p className="gallery-panel__title">{GALLERY_LIST_COPY.states.unauthenticatedTitle}</p>
        <p className="gallery-panel__body">{GALLERY_LIST_COPY.states.unauthenticatedBody}</p>
        <Link className="gallery-panel__action" href={LOGIN_ROUTE}>
          {GALLERY_LIST_COPY.actions.signIn}
        </Link>
      </section>
    );
  }

  return (
    <section
      className="gallery-panel gallery-panel--error"
      role="alert"
      data-testid="gallery-list-error"
    >
      <p className="gallery-panel__title">{GALLERY_LIST_COPY.states.errorTitle}</p>
      <p className="gallery-panel__body">{GALLERY_LIST_COPY.states.errorBody}</p>
      <button
        type="button"
        className="gallery-panel__action"
        data-testid="gallery-list-retry"
        onClick={onRetry}
      >
        {GALLERY_LIST_COPY.actions.retry}
      </button>
    </section>
  );
}
