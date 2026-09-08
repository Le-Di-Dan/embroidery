'use client';

import { PRODUCT_MEDIA_COPY } from '../model/product-media-copy';
import type { ProductMediaTileHandlers } from './product-media-tile-actions';

interface ProductMediaActionBarProps extends ProductMediaTileHandlers {
  readonly position: number;
  readonly total: number;
  readonly disabled: boolean;
  readonly onDismiss: () => void;
}

/**
 * The mobile selected-image action bar (`946:248`, `948:311` — 390).
 *
 * `APP12-M01.D1-C1` §I measured why this exists and is not the desktop bar in a
 * media query: four 44 px targets need 176 px of width and the 390 tile is
 * 157 px, so the in-tile bar cannot survive at any column count without
 * breaking the minimum touch target. The actions therefore leave the tile —
 * once, for whichever image is selected, rather than twenty times.
 *
 * Pinned to the bottom of the viewport so an image in row ten is operable
 * without scrolling away to find its controls, and it carries the position in
 * its own heading so the operator can see *which* image the four buttons act
 * on after scrolling past it.
 *
 * Each button shows a glyph **and** a text label — `Đại diện`, `Trước`, `Sau`,
 * `Gỡ` — while its accessible name carries the full position, because four
 * two-word labels are indistinguishable read out of context.
 *
 * Why a disabled `Gỡ` is disabled is **not** repeated here. The section states
 * the published minimum once, above the grid, where it is visible at every
 * viewport rather than only to an operator who has selected the one tile that
 * cannot be removed.
 */
export function ProductMediaActionBar({
  position,
  total,
  disabled,
  canMoveEarlier,
  canMoveLater,
  canRemove,
  onSetPrimary,
  onMoveEarlier,
  onMoveLater,
  onRemove,
  onDismiss,
}: ProductMediaActionBarProps) {
  const isPrimary = position === 1;
  const place = { position, total };

  return (
    <div
      className="product-media-actionbar"
      role="group"
      aria-label={PRODUCT_MEDIA_COPY.actions.barLabel(place)}
    >
      <div className="product-media-actionbar__head">
        <p className="product-media-actionbar__title">{PRODUCT_MEDIA_COPY.tile.position(place)}</p>
        <button
          type="button"
          className="product-media-actionbar__dismiss"
          aria-label={PRODUCT_MEDIA_COPY.tile.deselect}
          onClick={onDismiss}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/*
        The anchor rule, said in one sentence rather than left as three dead
        controls. It is rendered only on the primary, where it is the answer to
        a question the operator is about to ask.
      */}
      {isPrimary ? (
        <p className="product-media-actionbar__note">
          {PRODUCT_MEDIA_COPY.actions.primaryAnchorNote}
        </p>
      ) : null}

      <div className="product-media-actionbar__buttons">
        <button
          type="button"
          className="product-media-actionbar__button"
          aria-label={PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place)}
          disabled={disabled || isPrimary}
          onClick={onSetPrimary}
        >
          <span aria-hidden="true">★</span>
          <span className="product-media-actionbar__label">
            {PRODUCT_MEDIA_COPY.actions.setPrimaryShort}
          </span>
        </button>
        <button
          type="button"
          className="product-media-actionbar__button"
          aria-label={PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place)}
          disabled={disabled || !canMoveEarlier}
          onClick={onMoveEarlier}
        >
          <span aria-hidden="true">←</span>
          <span className="product-media-actionbar__label">
            {PRODUCT_MEDIA_COPY.actions.moveEarlierShort}
          </span>
        </button>
        <button
          type="button"
          className="product-media-actionbar__button"
          aria-label={PRODUCT_MEDIA_COPY.actions.moveLaterLabel(place)}
          disabled={disabled || !canMoveLater}
          onClick={onMoveLater}
        >
          <span aria-hidden="true">→</span>
          <span className="product-media-actionbar__label">
            {PRODUCT_MEDIA_COPY.actions.moveLaterShort}
          </span>
        </button>
        <button
          type="button"
          className="product-media-actionbar__button product-media-actionbar__button--remove"
          aria-label={PRODUCT_MEDIA_COPY.actions.removeLabel(place)}
          disabled={disabled || !canRemove}
          onClick={onRemove}
        >
          <span aria-hidden="true">✕</span>
          <span className="product-media-actionbar__label">
            {PRODUCT_MEDIA_COPY.actions.removeShort}
          </span>
        </button>
      </div>
    </div>
  );
}
