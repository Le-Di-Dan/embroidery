'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

import type { GalleryDetailMedia } from '../model/gallery-detail-view';
import { GALLERY_DETAIL_COPY, galleryThumbnailLabel } from '../model/gallery-detail-copy';

interface GalleryDetailThumbnailsProps {
  readonly media: readonly GalleryDetailMedia[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly hasFailed: (index: number) => boolean;
  readonly onFailed: (index: number) => void;
}

/**
 * The ordered thumbnail controls.
 *
 * The order is the API's, used verbatim — the same array the stage and the
 * lightbox index into. There is no client sort, no ratio bucketing and no
 * attempt to reconstruct the private `display_order`: `APP11-B03` already
 * renumbered its output over the deliverable images, and re-deriving that here
 * would substitute our arithmetic for the curator's sequence.
 *
 * Each thumbnail shows the **same** address as the stage. The contract
 * publishes one URL per image at the detail rendition and no thumbnail
 * rendition, so deriving a smaller one by string replacement would be guessing
 * at an endpoint that may not serve it. The box is sized in CSS instead.
 *
 * Roving tabindex: the strip is one Tab stop and Arrow keys move within it, so
 * a keyboard visitor is not forced through eight stops to reach the narrative
 * below. Home and End jump to the ends. Focus follows selection, which is what
 * makes arrowing feel like looking rather than like queuing an action.
 *
 * Labels are index-based — "Xem ảnh 2 trên 6". The backend publishes no caption
 * and `ALT_TEXT_MODEL` is `DERIVED_NOT_PERSISTED`, so a named label would
 * describe an image nobody in this system has seen.
 *
 * The selected control is marked with `aria-current`, not colour alone, so the
 * state survives greyscale, high contrast and a screen reader.
 */
export function GalleryDetailThumbnails({
  media,
  selectedIndex,
  onSelect,
  hasFailed,
  onFailed,
}: GalleryDetailThumbnailsProps) {
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
      className="gallery-detail__thumbnails"
      ref={listRef}
      aria-label={GALLERY_DETAIL_COPY.mediaLabel}
      onKeyDown={handleKeyDown}
    >
      {media.map((item, index) => {
        const selected = index === selectedIndex;
        const failed = hasFailed(index);
        return (
          <li key={item.url} className="gallery-detail__thumbnail-item">
            <button
              type="button"
              className="gallery-detail__thumbnail"
              aria-label={galleryThumbnailLabel(index, media.length)}
              {...(selected ? { 'aria-current': 'true' as const } : {})}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(index)}
            >
              {failed ? (
                <span className="gallery-detail__thumbnail-fallback">
                  {GALLERY_DETAIL_COPY.thumbnailUnavailable}
                </span>
              ) : (
                // Decorative: the button already carries the accessible name,
                // so an alt here would announce the same image twice.
                // No intrinsic dimensions are published; see GalleryDetailStage.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="gallery-detail__thumbnail-image"
                  src={item.url}
                  alt=""
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
