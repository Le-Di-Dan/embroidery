'use client';

import { createPortal } from 'react-dom';

import type { ProductDetailMedia } from '../model/product-detail-view';
import {
  lightboxTitle,
  mainMediaAlt,
  positionLabel,
  PRODUCT_DETAIL_COPY,
} from '../model/product-detail-copy';
import { useDialogFocus } from '../hooks/use-dialog-focus';
import { DetailChevron } from './detail-chevron';

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
 * Previous/next are circular outline buttons carrying a chevron, not the words
 * *"Ảnh trước"* / *"Ảnh sau"* they used to spell out. Two labelled word-buttons
 * flanking the artwork read as instructions to a reader rather than as controls
 * on a viewer, and they competed with the image for the eye. The words are not
 * gone — they moved to `aria-label`, so the copy stays owned by the Vietnamese
 * message repository and the accessible names are byte-identical to what they
 * were. Close keeps its word: it is the one control whose meaning an icon
 * genuinely obscures, and it sits in the header rather than over the artwork.
 *
 * With a single image there are no previous/next controls at all rather than
 * disabled ones: a control that can never do anything is noise in the tab order.
 *
 * A failure inside the dialog shows the same honest message as the page stage
 * and leaves close and the other controls working, so the visitor is never
 * trapped in a modal showing nothing.
 *
 * ## Why this renders through a portal (`APP12-M01.S1-C1`)
 *
 * The scrim is `position: fixed; inset: 0`, which describes the viewport — but
 * where an element *paints* is decided by its stacking context, not by its
 * coordinates. Rendered in place, this dialog is a descendant of
 * `.product-detail__gallery`, which `APP12-V02` makes `position: sticky` at the
 * split hero width. **Sticky positioning creates a stacking context
 * unconditionally**, regardless of `z-index`, so the scrim's `z-index` was being
 * compared only against its siblings *inside the gallery column* — while the
 * gallery itself entered the page at `z-index: auto`. The shell's sticky header
 * and the purchase panel's positioned variant pills therefore painted over an
 * overlay that believed it covered the viewport, and `APP12-M01.S1`'s own
 * evidence caught them doing it.
 *
 * A larger `z-index` could not have fixed that, because the two numbers were
 * never being compared. Moving the subtree to `document.body` is what makes the
 * comparison real: the scrim becomes a child of the root stacking context, where
 * the shell's layers actually live, and its `$scrim-layer` is then measured
 * against them rather than against its own siblings.
 *
 * Nothing else moves. The dialog keeps its props, its state stays in
 * `DetailGallery` — there is still exactly one gallery state machine — and the
 * focus trap keeps working because it is driven by a ref, which follows the
 * node wherever React renders it. React also keeps portalled children in the
 * *React* tree, so events still bubble to the gallery island as before.
 *
 * The guard below is what makes this safe to import from a server-rendered
 * route: `document` is touched during render, so it must not be reached for
 * where there is no document. In practice this branch is never taken —
 * `lightboxOpen` starts `false`, so the server never renders this component at
 * all — which is also why there is no open-on-mount flash to suppress.
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

  // Server render, or any environment without a DOM: nothing to portal into.
  // Placed after every hook so the hook order is unconditional.
  if (typeof document === 'undefined') return null;

  return createPortal(
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
              className="product-detail__dialog-nav"
              aria-label={PRODUCT_DETAIL_COPY.lightboxPrevious}
              onClick={onPrevious}
              disabled={index === 0}
            >
              <DetailChevron direction="previous" />
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
              className="product-detail__dialog-nav"
              aria-label={PRODUCT_DETAIL_COPY.lightboxNext}
              onClick={onNext}
              disabled={index === media.length - 1}
            >
              <DetailChevron direction="next" />
            </button>
          ) : null}
        </div>

        {many ? (
          <p className="product-detail__dialog-position">{positionLabel(index, media.length)}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
