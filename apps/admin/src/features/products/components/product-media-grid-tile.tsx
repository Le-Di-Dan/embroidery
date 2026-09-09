'use client';

import { AssetThumbnail } from '../../../shared/media/asset-thumbnail';
import {
  assetThumbnailCaption,
  toAssetThumbnailState,
} from '../../../shared/media/asset-thumbnail-state';
import { PRODUCT_MEDIA_COPY } from '../model/product-media-copy';
import {
  ProductMediaTileActions,
  type ProductMediaTileHandlers,
} from './product-media-tile-actions';

export interface ProductMediaGridTileProps extends ProductMediaTileHandlers {
  readonly assetId: string;
  /**
   * The Asset's lifecycle status, from the Admin read.
   *
   * Absent for an image the operator has just picked: it is in the staged
   * selection and has no server row yet, so the read has no opinion about it.
   * The picker offers only deliverable Assets, so "no opinion yet" is rendered
   * as healthy — the tile downgrades when the read says something worse, never
   * because it has not been told anything.
   */
  readonly status?: string | undefined;
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
  status,
  position,
  total,
  selected,
  disabled,
  onSelect,
  ...handlers
}: ProductMediaGridTileProps) {
  const isPrimary = position === 1;
  const place = { position, total };
  // See the `status` prop: no opinion from the read means a staged image, which
  // is drawn as healthy. Anything the read *does* say is honoured, including
  // the states this tile used to hide behind a hard-coded `READY`.
  const mediaState = status === undefined ? 'READY' : toAssetThumbnailState(status);

  // A rejected Asset keeps its picture. `adminAsset_preview` serves derivative
  // bytes regardless of the Asset's lifecycle state — `APP12-M01.E1` proved
  // that, and `E1-C1` §8 requires it to stay that way — and an operator
  // curating twenty images finds them by their photograph. Replacing it with a
  // glyph would make the grid harder to work in order to say something the
  // state line below says in words.
  //
  // The states with no bytes to show still fall back: an Asset mid-inspection
  // has no derivative yet, and one whose status this screen does not recognise
  // gets no promise of an image.
  const thumbnailState = mediaState === 'REJECTED' ? 'READY' : mediaState;

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
        <AssetThumbnail
          assetId={assetId}
          state={thumbnailState}
          className="product-media-tile__image"
        />
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

      {/*
        The state in words, beside the role rather than instead of it.

        `AssetThumbnail` already states it — but only as the accessible name of
        the placeholder it swaps in, which a sighted operator reads as "the
        picture went away" without being told why. This line is the same
        approved caption, visible.

        Beside the role, because the two facts are independent and an operator
        needs both at once: an image can be the stored primary *and* no longer
        usable, which is exactly the state that leaves the public pages on a
        fallback while this screen looks healthy. Replacing the role with the
        state would hide the first fact to show the second.
      */}
      {mediaState === 'READY' ? null : (
        <p className="product-media-tile__state">{assetThumbnailCaption(mediaState)}</p>
      )}

      <ProductMediaTileActions
        position={position}
        total={total}
        disabled={disabled}
        {...handlers}
      />
    </li>
  );
}
