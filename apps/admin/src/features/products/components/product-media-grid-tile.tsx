'use client';

import { AssetThumbnail } from '../../../shared/media/asset-thumbnail';
import { PRODUCT_MEDIA_COPY } from '../model/product-media-copy';
import {
  ProductMediaTileActions,
  type ProductMediaTileHandlers,
} from './product-media-tile-actions';

export interface ProductMediaGridTileProps extends ProductMediaTileHandlers {
  readonly assetId: string;
  /** 1-based, as the operator counts. */
  readonly position: number;
  readonly total: number;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
}

/**
 * One image in the media grid (`934:231` — the tile-state legend).
 *
 * The tile is deliberately **not** one button. Selecting it and acting on it
 * are different intents, so the image is a real `<button>` — never a clickable
 * `<div>` — and the four actions are their own buttons beside it. That also
 * makes the tile a small, ordinary focus sequence rather than one control with
 * four hidden meanings.
 *
 * ## What is on the tile at rest
 *
 * Its picture, its position and, if it has one, its primary state. Nothing
 * else: `APP2-B01` stores no filename, and an Asset UUID is not operator-facing
 * identity, so neither is invented here. The action bar appears on hover **and**
 * on `focus-within` (a stylesheet concern), which is what keeps it from being
 * keyboard-invisible while still honouring the ban on four permanent controls
 * per image.
 *
 * ## Primary state is never colour alone
 *
 * A badge on the image and a text label beneath it — two independent signals,
 * both of which survive greyscale. The same holds for selection: an accent ring
 * *and* `aria-pressed`, so the state is exposed rather than merely drawn.
 */
export function ProductMediaGridTile({
  assetId,
  position,
  total,
  selected,
  disabled,
  onSelect,
  ...handlers
}: ProductMediaGridTileProps) {
  const isPrimary = position === 1;
  const place = { position, total };

  return (
    <li
      className="product-media-tile"
      data-selected={selected ? 'true' : undefined}
      data-primary={isPrimary ? 'true' : undefined}
    >
      <button
        type="button"
        className="product-media-tile__select"
        aria-pressed={selected}
        aria-label={PRODUCT_MEDIA_COPY.tile.select(place)}
        disabled={disabled}
        onClick={onSelect}
      >
        <AssetThumbnail assetId={assetId} state="READY" className="product-media-tile__image" />
        {/*
          The number is decorative here: every action's accessible name already
          carries "ảnh {position} trên {total}", and the select button's own
          name states it once. Reading it a fourth time would be noise.
        */}
        <span className="product-media-tile__position" aria-hidden="true">
          {position}
        </span>
        {isPrimary ? (
          <span className="product-media-tile__badge" aria-hidden="true">
            {PRODUCT_MEDIA_COPY.tile.rolePrimary}
          </span>
        ) : null}
      </button>

      <p className="product-media-tile__role">
        {isPrimary ? PRODUCT_MEDIA_COPY.tile.rolePrimary : PRODUCT_MEDIA_COPY.tile.roleGallery}
      </p>

      <ProductMediaTileActions
        position={position}
        total={total}
        disabled={disabled}
        {...handlers}
      />
    </li>
  );
}
