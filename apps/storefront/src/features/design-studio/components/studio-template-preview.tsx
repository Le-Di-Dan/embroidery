'use client';

import { STUDIO_COPY } from '../model/studio-copy';
import type { TemplateDetailState } from '../hooks/use-template-detail';
import type { TemplatePreviewState } from '../hooks/use-template-preview';

export interface StudioTemplatePreviewProps {
  readonly detail: TemplateDetailState;
  readonly preview: TemplatePreviewState;
  /** True when the selected version's document places no image at all. */
  readonly isTextOnly: boolean;
}

/**
 * A read-only preview of the selected Template (`APP3-B05A`).
 *
 * One image, rendered from a browser object URL over bytes the delivery route
 * authorised. This is deliberately **not** a renderer: the document is not
 * composited, no element is transformed and nothing is selectable, because the
 * editable scene is `APP3-S02` and building one here to fill a preview box
 * would be absorbing the next checkpoint.
 *
 * The `alt` names the Template rather than the asset. An Asset UUID is machine
 * identity and would be meaningless — and slightly alarming — as customer copy.
 *
 * A text-only Template is a valid Template and says so; it is not an error and
 * not an empty frame.
 */
export function StudioTemplatePreview({ detail, preview, isTextOnly }: StudioTemplatePreviewProps) {
  if (detail.failure === 'gone') {
    return (
      <p className="studio-preview__status" role="alert">
        {STUDIO_COPY.detailUnavailable}
      </p>
    );
  }

  if (detail.isLoading || preview.isLoading) {
    return (
      <p className="studio-preview__status" role="status">
        {detail.isLoading ? STUDIO_COPY.templateLoading : STUDIO_COPY.previewLoading}
      </p>
    );
  }

  if (detail.failure === 'retryable') {
    return (
      <p className="studio-preview__status" role="alert">
        {STUDIO_COPY.templateError}
      </p>
    );
  }

  if (isTextOnly) {
    return <p className="studio-preview__status">{STUDIO_COPY.previewTextOnly}</p>;
  }

  if (preview.failure === 'gone') {
    return (
      <p className="studio-preview__status" role="alert">
        {STUDIO_COPY.previewUnavailable}
      </p>
    );
  }

  if (preview.failure === 'retryable') {
    return (
      <div className="studio-preview__status">
        <p role="alert">{STUDIO_COPY.previewRetryable}</p>
        <button className="studio-button" onClick={preview.retry} type="button">
          {STUDIO_COPY.retry}
        </button>
      </div>
    );
  }

  if (preview.objectUrl === null) return null;

  return (
    <figure className="studio-preview">
      {/* A plain <img>: the source is a browser object URL over an in-memory
          blob, which the Next image pipeline can neither optimise nor size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={`${STUDIO_COPY.previewAlt} ${detail.detail?.name ?? ''}`.trim()}
        className="studio-preview__image"
        src={preview.objectUrl}
      />
    </figure>
  );
}
