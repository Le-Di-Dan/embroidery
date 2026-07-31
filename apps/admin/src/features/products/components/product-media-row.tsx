'use client';

import { AdminProductMediaResponseRole } from '@embroidery/api-client';

import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import { buildMediaMetaLine, resolveMediaTitle } from '../model/product-media-identity';
import type { ProductMediaRole } from '../model/product-media-selection';

export interface ProductMediaRowData {
  readonly assetId: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly createdAt: string;
}

interface ProductMediaRowProps {
  readonly media: ProductMediaRowData;
  readonly role: ProductMediaRole;
  readonly canMoveEarlier: boolean;
  readonly canMoveLater: boolean;
  readonly disabled: boolean;
  readonly onMoveEarlier: () => void;
  readonly onMoveLater: () => void;
  readonly onRemove: () => void;
}

/**
 * One selected image (`434:20` — Media row / Ảnh đại diện · Ảnh thư viện).
 *
 * The tile is an honest placeholder, not a broken image: `APP2` exposes no
 * authenticated media-delivery contract, so there is no URL to point at and
 * pretending otherwise would render a permanent broken-image icon. The
 * placeholder is `aria-hidden` with the absence stated in text instead.
 *
 * Identity is the server's: a media-type label and `{size} · {createdAt}`.
 * `APP2-B01` stores no original filename, so none is shown or invented.
 *
 * Reordering is by button, and the buttons are the primary mechanism rather
 * than a fallback — every accessible name carries the position so
 * "Di chuyển trước" is distinguishable between rows when read out of context.
 */
export function ProductMediaRow({
  media,
  role,
  canMoveEarlier,
  canMoveLater,
  disabled,
  onMoveEarlier,
  onMoveLater,
  onRemove,
}: ProductMediaRowProps) {
  const title = resolveMediaTitle(media.mediaType);
  const meta = buildMediaMetaLine(media.byteSize, media.createdAt);
  const roleLabel =
    role === AdminProductMediaResponseRole.THUMBNAIL
      ? PRODUCT_FORM_COPY.media.roleThumbnail
      : PRODUCT_FORM_COPY.media.roleGallery;

  return (
    <li className="product-media-row">
      <div className="product-media-row__top">
        <span className="product-media-row__placeholder" aria-hidden="true" />
        <span className="product-media-row__info">
          <span className="product-media-row__title">{title}</span>
          <span className="product-media-row__meta">{meta}</span>
          <span className="product-media-row__placeholder-note">
            {PRODUCT_FORM_COPY.identity.placeholder}
          </span>
        </span>
        <span className="product-media-row__role">{roleLabel}</span>
      </div>
      <div className="product-media-row__actions">
        <button
          type="button"
          className="product-media-row__action"
          onClick={onMoveEarlier}
          disabled={disabled || !canMoveEarlier}
          aria-label={`${PRODUCT_FORM_COPY.media.moveEarlier}: ${title}`}
        >
          {PRODUCT_FORM_COPY.media.moveEarlier}
        </button>
        <button
          type="button"
          className="product-media-row__action"
          onClick={onMoveLater}
          disabled={disabled || !canMoveLater}
          aria-label={`${PRODUCT_FORM_COPY.media.moveLater}: ${title}`}
        >
          {PRODUCT_FORM_COPY.media.moveLater}
        </button>
        <button
          type="button"
          className="product-media-row__action"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`${PRODUCT_FORM_COPY.media.remove}: ${title}`}
        >
          {PRODUCT_FORM_COPY.media.remove}
        </button>
      </div>
    </li>
  );
}
