'use client';

import { GALLERY_MEDIA_COPY } from '../model/gallery-media-copy';
import { GalleryAssetThumb } from './gallery-asset-thumb';

interface GalleryMediaRowProps {
  readonly assetId: string;
  readonly index: number;
  /** The entry's title, from which this image's alt text is derived. */
  readonly entryTitle: string;
  readonly canMoveEarlier: boolean;
  readonly canMoveLater: boolean;
  readonly disabled: boolean;
  readonly onMoveEarlier: () => void;
  readonly onMoveLater: () => void;
  readonly onSetCover: () => void;
  readonly onRemove: () => void;
}

/**
 * One selected image (`870:926`).
 *
 * ## Position is the meaning
 *
 * The first row is the cover — and the Open Graph image — because position 0 is
 * what the server and the public gallery both read. So the row states its
 * position in text and marks the first one, rather than carrying a "cover"
 * toggle that would be a second, contradictable source of truth.
 *
 * ## Ordering is by button, and the buttons are the mechanism
 *
 * There is no drag and drop, and no dependency was added to provide one:
 * pointer dragging is unusable by keyboard, awkward under a screen reader and
 * unreliable at 390. Every accessible name carries the position, so
 * "Di chuyển trước" is distinguishable between rows when read out of context,
 * and the first and last rows disable the move that would go nowhere rather
 * than offering one that silently does nothing.
 *
 * "Đặt làm ảnh bìa" is a move to the front — the same operation, named for what
 * the operator is actually trying to achieve — and it is hidden on the row that
 * is already the cover, where it would do nothing.
 *
 * ## Removing detaches, and that is all it does
 *
 * The asset, its renditions and the stored objects are untouched; the image
 * stays available in the picker and can be re-added. Nothing here can delete an
 * asset, because no delivered operation can.
 */
export function GalleryMediaRow({
  assetId,
  index,
  entryTitle,
  canMoveEarlier,
  canMoveLater,
  disabled,
  onMoveEarlier,
  onMoveLater,
  onSetCover,
  onRemove,
}: GalleryMediaRowProps) {
  const positionLabel = GALLERY_MEDIA_COPY.row.position(index);
  const isCover = index === 0;

  return (
    <li className="gallery-media-row" data-testid="gallery-media-row">
      <div className="gallery-media-row__top">
        <GalleryAssetThumb
          assetId={assetId}
          alt={GALLERY_MEDIA_COPY.row.alt(entryTitle, index)}
          testId="gallery-media-thumb"
        />
        <span className="gallery-media-row__info">
          <span className="gallery-media-row__position">{positionLabel}</span>
          {isCover ? (
            <span className="gallery-media-row__cover" data-testid="gallery-media-cover">
              {GALLERY_MEDIA_COPY.row.cover}
            </span>
          ) : null}
        </span>
      </div>
      <div className="gallery-media-row__actions">
        <button
          type="button"
          className="gallery-media-row__action"
          onClick={onMoveEarlier}
          disabled={disabled || !canMoveEarlier}
          aria-label={`${GALLERY_MEDIA_COPY.row.moveEarlier}: ${positionLabel}`}
        >
          {GALLERY_MEDIA_COPY.row.moveEarlier}
        </button>
        <button
          type="button"
          className="gallery-media-row__action"
          onClick={onMoveLater}
          disabled={disabled || !canMoveLater}
          aria-label={`${GALLERY_MEDIA_COPY.row.moveLater}: ${positionLabel}`}
        >
          {GALLERY_MEDIA_COPY.row.moveLater}
        </button>
        {isCover ? null : (
          <button
            type="button"
            className="gallery-media-row__action"
            onClick={onSetCover}
            disabled={disabled}
            aria-label={`${GALLERY_MEDIA_COPY.row.setCover}: ${positionLabel}`}
          >
            {GALLERY_MEDIA_COPY.row.setCover}
          </button>
        )}
        <button
          type="button"
          className="gallery-media-row__action"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`${GALLERY_MEDIA_COPY.row.remove}: ${positionLabel}`}
        >
          {GALLERY_MEDIA_COPY.row.remove}
        </button>
      </div>
    </li>
  );
}
