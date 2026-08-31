'use client';

import { useState } from 'react';

import { AdminGalleryEntryDetailResponseStatus } from '@embroidery/api-client';
import type { AdminGalleryEntryDetailResponse } from '@embroidery/api-client';

import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { presentGalleryStatus } from '../../../shared/presentation/gallery-status';
import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import {
  evaluateGalleryReadiness,
  type GalleryPublicationRequirement,
} from '../model/gallery-readiness';
import { GalleryUnpublishDialog } from './gallery-confirm-dialogs';

interface GalleryPublicationPanelProps {
  readonly entry: AdminGalleryEntryDetailResponse;
  /** True while either authoring or media holds unsaved work. */
  readonly hasUnsavedChanges: boolean;
  readonly pending: boolean;
  /** Requirement codes the last refused publish named, for emphasis only. */
  readonly flagged: readonly GalleryPublicationRequirement[];
  readonly onPublish: () => void;
  readonly onUnpublish: () => void;
  /** The command failure banner, owned by the screen so it outlives a refetch. */
  readonly failure: { readonly title: string; readonly body: string } | null;
  /** The last completed command's confirmation, or `null`. */
  readonly outcome: string | null;
}

/**
 * The publication panel (`870:1104` ready, `870:1187` blocked, `870:1274`
 * confirm unpublish).
 *
 * ## Readiness is advisory, and the server stays the authority
 *
 * The four requirements listed here are exactly the four the server evaluates —
 * a non-empty title, a slug, a non-empty description, and at least one attached
 * image — and they are evaluated from the **persisted** record, never from the
 * form. A linked product, SEO text and indexability are deliberately absent: a
 * `noindex` entry is publishable, and adding any of them would be this panel
 * refusing something the server would have allowed.
 *
 * Each requirement is a row with its own state in text, not a colour: an
 * operator must be able to read what is missing, not infer it from a tint.
 *
 * ## Unsaved work blocks the command, explicitly
 *
 * The server recomputes readiness from its own locked row, so publishing while
 * an unsaved title sits in a text box would evaluate the *old* title. Rather
 * than chaining a hidden save behind the button — which would make one click
 * perform two writes with two different failure modes — the panel says there is
 * unsaved work and requires the operator to save first.
 *
 * ## Nothing is optimistic
 *
 * The status, the requirements and the available actions all re-derive from the
 * authoritative record after the server answers, which is why a refused publish
 * leaves the panel showing `DRAFT` rather than a state the entry never entered.
 *
 * ## `ARCHIVED` is shown, and nothing is offered for it
 *
 * The status vocabulary has three values, but the delivered contract publishes
 * no archive and no restore operation — so this panel invents neither. An
 * archived entry shows its state and an honest explanation of what cannot be
 * done with it, and the two lifecycle buttons are simply absent rather than
 * present-and-disabled, which would imply a permission problem.
 */
export function GalleryPublicationPanel({
  entry,
  hasUnsavedChanges,
  pending,
  flagged,
  onPublish,
  onUnpublish,
  failure,
  outcome,
}: GalleryPublicationPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const copy = GALLERY_EDITOR_COPY.publication;
  const readiness = evaluateGalleryReadiness(entry);
  const status = presentGalleryStatus(entry.status);

  const isDraft = entry.status === AdminGalleryEntryDetailResponseStatus.DRAFT;
  const isPublished = entry.status === AdminGalleryEntryDetailResponseStatus.PUBLISHED;
  const isArchived = entry.status === AdminGalleryEntryDetailResponseStatus.ARCHIVED;

  const canPublish = isDraft && readiness.ready && !hasUnsavedChanges && !pending;
  const canUnpublish = isPublished && !hasUnsavedChanges && !pending;

  const summary = isArchived
    ? { title: copy.archivedTitle, body: copy.archivedBody }
    : isPublished
      ? { title: copy.publishedTitle, body: copy.publishedBody }
      : readiness.ready
        ? { title: copy.readyTitle, body: copy.readyBody }
        : { title: copy.blockedTitle, body: copy.blockedBody };

  return (
    <section
      className="gallery-editor__panel gallery-publication"
      aria-labelledby="gallery-publication-title"
    >
      <div className="gallery-publication__header">
        <h2 className="gallery-editor__panel-title" id="gallery-publication-title">
          {copy.groupTitle}
        </h2>
        <AdminStatusBadge
          token={status.token}
          label={status.label}
          tone={status.tone}
          symbol={status.symbol}
          testId="gallery-publication-status"
        />
      </div>

      <p className="gallery-publication__summary-title" data-testid="gallery-publication-summary">
        {summary.title}
      </p>
      <p className="gallery-publication__summary-body">{summary.body}</p>

      {isArchived ? null : (
        <ul className="gallery-publication__requirements">
          {(['title', 'slug', 'description', 'asset'] as const).map((requirement) => {
            const met = !readiness.unsatisfied.includes(requirement);
            return (
              <li
                key={requirement}
                className={
                  flagged.includes(requirement)
                    ? 'gallery-publication__requirement gallery-publication__requirement--flagged'
                    : 'gallery-publication__requirement'
                }
                data-testid={`gallery-requirement-${requirement}`}
                data-met={met ? 'true' : 'false'}
              >
                {/* The symbol is text, so the state survives without colour. */}
                <span className="gallery-publication__requirement-mark" aria-hidden="true">
                  {met ? '✓' : '•'}
                </span>
                <span>{copy.requirements[requirement]}</span>
              </li>
            );
          })}
        </ul>
      )}

      {hasUnsavedChanges && !isArchived ? (
        <div className="gallery-editor__notice" data-testid="gallery-publication-unsaved">
          <p className="gallery-editor__notice-title">{copy.unsavedTitle}</p>
          <p className="gallery-editor__notice-body">{copy.unsavedBody}</p>
        </div>
      ) : null}

      {failure === null ? null : (
        <div
          className="gallery-editor__failure"
          role="alert"
          data-testid="gallery-publication-failure"
        >
          <p className="gallery-editor__failure-title">{failure.title}</p>
          <p className="gallery-editor__failure-body">{failure.body}</p>
        </div>
      )}

      {outcome === null ? null : (
        <p className="gallery-editor__confirmation" role="status">
          {outcome}
        </p>
      )}

      <div className="gallery-publication__actions">
        {isDraft ? (
          <button
            type="button"
            className="gallery-editor__primary"
            onClick={onPublish}
            disabled={!canPublish}
            aria-busy={pending}
            data-testid="gallery-publish"
          >
            {pending ? copy.publishing : copy.publish}
          </button>
        ) : null}

        {isPublished ? (
          <button
            type="button"
            className="gallery-editor__secondary"
            onClick={() => setConfirming(true)}
            disabled={!canUnpublish}
            aria-busy={pending}
            data-testid="gallery-unpublish"
          >
            {pending ? copy.unpublishing : copy.unpublish}
          </button>
        ) : null}
      </div>

      {confirming ? (
        <GalleryUnpublishDialog
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onUnpublish();
          }}
        />
      ) : null}
    </section>
  );
}
