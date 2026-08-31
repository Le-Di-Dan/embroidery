'use client';

import type { KeyboardEvent } from 'react';

import type { GalleryDetailMedia } from '../model/gallery-detail-view';
import {
  galleryLightboxTitle,
  galleryMediaAlt,
  galleryPositionLabel,
  GALLERY_DETAIL_COPY,
} from '../model/gallery-detail-copy';
import { useGalleryDialogFocus } from '../hooks/use-gallery-dialog-focus';

interface GalleryDetailLightboxProps {
  readonly media: readonly GalleryDetailMedia[];
  readonly title: string;
  readonly index: number;
  readonly failed: boolean;
  readonly onClose: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onFailed: () => void;
}

const TITLE_ID = 'gallery-detail-lightbox-title';

/**
 * The large view (`862:626` desktop / `862:641` mobile, both cloned from the
 * approved Product Detail lightbox `533:3` / `533:26`, behaviour inherited
 * verbatim from the state board `537:38`).
 *
 * A real modal dialog: `role="dialog"`, `aria-modal`, an accessible title,
 * focus trapped inside and returned to the exact opener on close, Escape to
 * close, and page scroll locked while open — all from `useGalleryDialogFocus`.
 *
 * Arrow navigation follows the API's media order, because the index it moves is
 * the index into that array; there is no separate lightbox ordering to drift
 * from the strip's.
 *
 * Position is exposed as text ("Ảnh 2 trên 6"), never as a highlighted dot
 * alone, so "where am I" survives greyscale and a screen reader.
 *
 * With a single image there are no previous/next controls at all rather than
 * disabled ones, and no position line: a control that can never do anything is
 * noise in the tab order, and "Ảnh 1 trên 1" is noise in the accessible name.
 *
 * A failure inside the dialog shows the same honest message as the page stage
 * and leaves close and the other controls working, so the visitor is never
 * trapped in a modal showing nothing.
 */
export function GalleryDetailLightbox({
  media,
  title,
  index,
  failed,
  onClose,
  onPrevious,
  onNext,
  onFailed,
}: GalleryDetailLightboxProps) {
  const containerRef = useGalleryDialogFocus(true, onClose);
  const current = media[index];
  const many = media.length > 1;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!many) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onPrevious();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onNext();
    }
  }

  return (
    <div className="gallery-detail__scrim">
      <div
        className="gallery-detail__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={containerRef}
        onKeyDown={handleKeyDown}
      >
        <div className="gallery-detail__dialog-header">
          <p className="gallery-detail__dialog-title" id={TITLE_ID}>
            {galleryLightboxTitle(title)}
          </p>
          <button type="button" className="gallery-detail__dialog-control" onClick={onClose}>
            {GALLERY_DETAIL_COPY.lightboxClose}
          </button>
        </div>

        <div className="gallery-detail__dialog-stage-row">
          {many ? (
            <button
              type="button"
              className="gallery-detail__dialog-control"
              onClick={onPrevious}
              disabled={index === 0}
            >
              {GALLERY_DETAIL_COPY.lightboxPrevious}
            </button>
          ) : null}

          <div className="gallery-detail__dialog-stage">
            {failed || current === undefined ? (
              <p className="gallery-detail__stage-message">{GALLERY_DETAIL_COPY.mediaError}</p>
            ) : (
              // No intrinsic dimensions are published; see GalleryDetailStage.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="gallery-detail__dialog-image"
                src={current.url}
                alt={galleryMediaAlt(title, index, media.length)}
                onError={onFailed}
                decoding="async"
              />
            )}
          </div>

          {many ? (
            <button
              type="button"
              className="gallery-detail__dialog-control"
              onClick={onNext}
              disabled={index === media.length - 1}
            >
              {GALLERY_DETAIL_COPY.lightboxNext}
            </button>
          ) : null}
        </div>

        {many ? (
          <p className="gallery-detail__dialog-position">
            {galleryPositionLabel(index, media.length)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
