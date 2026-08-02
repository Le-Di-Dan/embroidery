'use client';

import type { ProductDetailMedia } from '../model/product-detail-view';
import {
  lightboxTitle,
  mainMediaAlt,
  positionLabel,
  PRODUCT_DETAIL_COPY,
} from '../model/product-detail-copy';
import { useDialogFocus } from '../hooks/use-dialog-focus';

interface DetailLightboxProps {
  readonly media: readonly ProductDetailMedia[];
  readonly name: string;
  readonly index: number;
  readonly failed: boolean;
  readonly onClose: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onFailed: () => void;
}

const TITLE_ID = 'product-detail-lightbox-title';

/**
 * The large view (`533:3` / `533:26`).
 *
 * A real modal dialog: `role="dialog"`, `aria-modal`, an accessible title, focus
 * trapped inside and returned to the opener on close, Escape to close, and page
 * scroll locked while open — all from `useDialogFocus`.
 *
 * Position is exposed as text ("Ảnh 2 trên 6"), never as a highlighted dot
 * alone, so "where am I" survives greyscale and a screen reader.
 *
 * With a single image there are no previous/next controls at all rather than
 * disabled ones: a control that can never do anything is noise in the tab order.
 *
 * A failure inside the dialog shows the same honest message as the page stage
 * and leaves close and the other controls working, so the visitor is never
 * trapped in a modal showing nothing.
 */
export function DetailLightbox({
  media,
  name,
  index,
  failed,
  onClose,
  onPrevious,
  onNext,
  onFailed,
}: DetailLightboxProps) {
  const containerRef = useDialogFocus(true, onClose);
  const current = media[index];
  const many = media.length > 1;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
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
    <div className="product-detail__scrim">
      <div
        className="product-detail__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={containerRef}
        onKeyDown={handleKeyDown}
      >
        <div className="product-detail__dialog-header">
          <p className="product-detail__dialog-title" id={TITLE_ID}>
            {lightboxTitle(name)}
          </p>
          <button type="button" className="product-detail__dialog-control" onClick={onClose}>
            {PRODUCT_DETAIL_COPY.lightboxClose}
          </button>
        </div>

        <div className="product-detail__dialog-stage-row">
          {many ? (
            <button
              type="button"
              className="product-detail__dialog-control"
              onClick={onPrevious}
              disabled={index === 0}
            >
              {PRODUCT_DETAIL_COPY.lightboxPrevious}
            </button>
          ) : null}

          <div className="product-detail__dialog-stage">
            {failed || current === undefined ? (
              <p className="product-detail__stage-message">{PRODUCT_DETAIL_COPY.mediaError}</p>
            ) : (
              // No intrinsic dimensions are published; see DetailMediaStage.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="product-detail__dialog-image"
                src={current.url}
                alt={mainMediaAlt(name, index, media.length)}
                onError={onFailed}
                decoding="async"
              />
            )}
          </div>

          {many ? (
            <button
              type="button"
              className="product-detail__dialog-control"
              onClick={onNext}
              disabled={index === media.length - 1}
            >
              {PRODUCT_DETAIL_COPY.lightboxNext}
            </button>
          ) : null}
        </div>

        {many ? (
          <p className="product-detail__dialog-position">{positionLabel(index, media.length)}</p>
        ) : null}
      </div>
    </div>
  );
}
