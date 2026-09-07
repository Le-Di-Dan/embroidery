'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

import type { ProductDetailMedia } from '../model/product-detail-view';
import { PRODUCT_DETAIL_COPY, thumbnailLabel } from '../model/product-detail-copy';

interface DetailThumbnailStripProps {
  readonly media: readonly ProductDetailMedia[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly hasFailed: (index: number) => boolean;
  readonly onFailed: (index: number) => void;
}

/**
 * The ordered thumbnail controls (`APP2-T01` catalog-preview, server order).
 *
 * Roving tabindex: the strip is one Tab stop and Arrow keys move within it, so a
 * keyboard visitor is not forced through eight stops to reach the story below.
 * Home and End jump to the ends. Focus follows selection, which is what makes
 * arrowing feel like looking rather than like queuing an action.
 *
 * Labels are index-based — "Xem ảnh 2 trên 6". The backend publishes no caption,
 * and the UI03 draft's names ("Toàn cảnh", "Chi tiết chỉ tơ") were provisional
 * copy invented for a mockup; using them would describe images nobody has seen.
 *
 * The selected control is marked with `aria-current`, not colour alone, so the
 * state survives greyscale, high contrast and a screen reader.
 */
export function DetailThumbnailStrip({
  media,
  selectedIndex,
  onSelect,
  hasFailed,
  onFailed,
}: DetailThumbnailStripProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const shouldFocusRef = useRef(false);

  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button');
    buttons?.[selectedIndex]?.focus();
  }, [selectedIndex]);

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    const moves: Record<string, number | undefined> = {
      ArrowLeft: selectedIndex - 1,
      ArrowRight: selectedIndex + 1,
      Home: 0,
      End: media.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    if (next < 0 || next >= media.length) return;
    shouldFocusRef.current = true;
    onSelect(next);
  }

  return (
    <ul
      className="product-detail__thumbnails"
      ref={listRef}
      aria-label={PRODUCT_DETAIL_COPY.galleryLabel}
      onKeyDown={handleKeyDown}
    >
      {media.map((item, index) => {
        const selected = index === selectedIndex;
        const failed = hasFailed(index);
        return (
          <li key={item.url} className="product-detail__thumbnail-item">
            <button
              type="button"
              className="product-detail__thumbnail"
              aria-label={thumbnailLabel(index, media.length)}
              {...(selected ? { 'aria-current': 'true' as const } : {})}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(index)}
            >
              {failed ? (
                <span className="product-detail__thumbnail-fallback">
                  {PRODUCT_DETAIL_COPY.thumbnailUnavailable}
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- see DetailMediaStage.
                <img
                  className="product-detail__thumbnail-image"
                  // The small rendition (`APP12-M01-B1`, closing `FU-APP12-H05-03`).
                  // This box is 64 px; it used to be handed the same
                  // `catalog-preview` derivative as the stage, which `APP12-H05`
                  // measured at 44 % of the page's image weight for three
                  // images, and `APP12-M01.A` projected at 6.63 MB for twenty.
                  src={item.thumbnailUrl}
                  alt=""
                  {...(item.thumbnailWidth === undefined || item.thumbnailHeight === undefined
                    ? {}
                    : { width: item.thumbnailWidth, height: item.thumbnailHeight })}
                  loading="lazy"
                  decoding="async"
                  onError={() => onFailed(index)}
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
