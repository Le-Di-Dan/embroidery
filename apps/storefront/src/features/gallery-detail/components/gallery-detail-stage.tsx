'use client';

import { useCallback } from 'react';

import { galleryMediaAlt, GALLERY_DETAIL_COPY } from '../model/gallery-detail-copy';

interface GalleryDetailStageProps {
  readonly url: string;
  readonly title: string;
  readonly index: number;
  readonly total: number;
  readonly failed: boolean;
  readonly onError: () => void;
}

/**
 * The bounded stage that holds the currently selected entry image
 * (`860:442` / `861:4321` / `861:4487`, media section cloned from the approved
 * Product Detail stage).
 *
 * A plain `<img>`, not `next/image`: `publicGalleryEntryDetail` publishes no
 * width or height, and `next/image` requires intrinsic dimensions. Supplying
 * them would mean inventing a ratio and cropping every image to it — which is
 * precisely what the approved authority forbids (contain, natural ratio).
 *
 * The image therefore sits in a neutral bounded box under `object-fit: contain`
 * and keeps whatever proportions the studio photographed.
 *
 * A failure states itself. It does not swap in another image and does not fall
 * back to a different rendition — the contract publishes exactly one address
 * per image, so there is no second one to try, and a silent substitution would
 * leave the visitor with no way to know they were looking at something other
 * than what they asked for. The surrounding title, narrative and related links
 * stay perfectly usable without it.
 */
export function GalleryDetailStage({
  url,
  title,
  index,
  total,
  failed,
  onError,
}: GalleryDetailStageProps) {
  /**
   * The image is server-rendered, so it can finish loading — or fail — before
   * React hydrates and attaches `onError`. That event is then simply lost, and
   * a withdrawn image would sit there as a blank box claiming nothing is
   * wrong. Checking the element's own state the moment the ref attaches closes
   * that window: a decoded image reports a non-zero `naturalWidth`, and a
   * `complete` image with zero width is one the browser has already given up
   * on.
   *
   * Carried over from `APP2-S02`, where it was measured rather than theorised:
   * aborting the media request in the production smoke left the page silent
   * until this check existed.
   */
  const captureAlreadyFailed = useCallback(
    (element: HTMLImageElement | null) => {
      if (element === null) return;
      if (element.complete && element.naturalWidth === 0) onError();
    },
    [onError],
  );

  if (failed) {
    return (
      <div className="gallery-detail__stage gallery-detail__stage--error">
        <p className="gallery-detail__stage-message">{GALLERY_DETAIL_COPY.mediaError}</p>
      </div>
    );
  }

  return (
    <div className="gallery-detail__stage">
      {/* eslint-disable-next-line @next/next/no-img-element -- see the note above:
          the contract carries no intrinsic dimensions, so next/image cannot be
          used without fabricating a ratio. */}
      <img
        className="gallery-detail__stage-image"
        src={url}
        alt={galleryMediaAlt(title, index, total)}
        ref={captureAlreadyFailed}
        onError={onError}
        decoding="async"
      />
    </div>
  );
}
