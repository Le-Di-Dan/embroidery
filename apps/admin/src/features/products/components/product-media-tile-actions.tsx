'use client';

import { PRODUCT_MEDIA_COPY } from '../model/product-media-copy';

/** What a tile can do, and whether each is currently allowed. */
export interface ProductMediaTileHandlers {
  readonly canMoveEarlier: boolean;
  readonly canMoveLater: boolean;
  readonly canRemove: boolean;
  readonly onSetPrimary: () => void;
  readonly onMoveEarlier: () => void;
  readonly onMoveLater: () => void;
  readonly onRemove: () => void;
}

interface ProductMediaTileActionsProps extends ProductMediaTileHandlers {
  readonly position: number;
  readonly total: number;
  readonly disabled: boolean;
}

/**
 * The desktop / tablet in-tile action bar (`934:231`, `941:187`).
 *
 * Four 32 px controls inside a 168 px tile at 1440 and a 152 px tile at 1024.
 * It is **not** the mobile treatment and must not become one: at 390 the tile is
 * 157 px and four 44 px touch targets need 176 px, which is why
 * `APP12-M01.D1-C1` §I put the mobile actions in a single selected-image bar
 * instead. Collapsing the two into one responsive component was explicitly
 * ruled out there, and the stylesheet hides this bar below the grid's two-column
 * breakpoint rather than shrinking it below a usable target.
 *
 * ## The primary tile offers no set-primary action
 *
 * Not a disabled star with a tooltip — the action is absent, because "make the
 * primary the primary" is not a thing an operator can want. Its arrows *are*
 * rendered and disabled, because the operator can legitimately want to move it
 * and needs to be told, programmatically, that the answer is no and why
 * (`actions.primaryAnchorNote`).
 */
export function ProductMediaTileActions({
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
}: ProductMediaTileActionsProps) {
  const isPrimary = position === 1;
  const place = { position, total };

  return (
    <div className="product-media-tile__actions">
      {isPrimary ? null : (
        <button
          type="button"
          className="product-media-tile__action product-media-tile__action--primary"
          aria-label={PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place)}
          title={PRODUCT_MEDIA_COPY.actions.setPrimary}
          disabled={disabled}
          onClick={onSetPrimary}
        >
          <span aria-hidden="true">★</span>
        </button>
      )}
      <button
        type="button"
        className="product-media-tile__action"
        aria-label={PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place)}
        title={PRODUCT_MEDIA_COPY.actions.moveEarlier}
        disabled={disabled || !canMoveEarlier}
        onClick={onMoveEarlier}
      >
        <span aria-hidden="true">←</span>
      </button>
      <button
        type="button"
        className="product-media-tile__action"
        aria-label={PRODUCT_MEDIA_COPY.actions.moveLaterLabel(place)}
        title={PRODUCT_MEDIA_COPY.actions.moveLater}
        disabled={disabled || !canMoveLater}
        onClick={onMoveLater}
      >
        <span aria-hidden="true">→</span>
      </button>
      <button
        type="button"
        className="product-media-tile__action product-media-tile__action--remove"
        aria-label={PRODUCT_MEDIA_COPY.actions.removeLabel(place)}
        title={PRODUCT_MEDIA_COPY.actions.remove}
        disabled={disabled || !canRemove}
        onClick={onRemove}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
