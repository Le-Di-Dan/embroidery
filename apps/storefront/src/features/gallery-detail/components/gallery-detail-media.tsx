'use client';

import { useState } from 'react';

import type { GalleryDetailMedia as GalleryDetailMediaItem } from '../model/gallery-detail-view';
import { galleryOpenLightboxLabel, GALLERY_DETAIL_COPY } from '../model/gallery-detail-copy';
import { useGalleryMediaSelection } from '../hooks/use-gallery-media-selection';
import { GalleryDetailStage } from './gallery-detail-stage';
import { GalleryDetailThumbnails } from './gallery-detail-thumbnails';
import { GalleryDetailLightbox } from './gallery-detail-lightbox';

interface GalleryDetailMediaProps {
  readonly media: readonly GalleryDetailMediaItem[];
  readonly title: string;
}

/**
 * The media island: which image is showing, which have failed, and whether the
 * large view is open.
 *
 * **There is no successful zero-image state, and none is implemented.**
 * `APP11-B03` answers the safe 404 for a published entry with no currently
 * deliverable image, so `media` is non-empty on every read that reaches this
 * component; the route has already sent the visitor to the not-found surface
 * otherwise. Rendering an "no images yet" placeholder here would be a state
 * the backend has made unreachable, sitting in the code claiming to be
 * possible.
 *
 * With exactly one image the thumbnail strip and the previous/next controls
 * are absent rather than disabled: a strip of one and a pair of controls that
 * can never move cost two Tab stops and answer no question.
 *
 * The stage opens the large view through a real `<button>` wrapping the image,
 * not a click handler on a `<div>`: the control has to be reachable by keyboard
 * and announce itself, and only a button does both for free.
 */
export function GalleryDetailMedia({ media, title }: GalleryDetailMediaProps) {
  const { selectedIndex, select, selectPrevious, selectNext, hasFailed, markFailed } =
    useGalleryMediaSelection(media.length);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const current = media[selectedIndex];
  const failed = hasFailed(selectedIndex);
  const many = media.length > 1;

  return (
    <section className="gallery-detail__media" aria-label={GALLERY_DETAIL_COPY.mediaLabel}>
      <button
        type="button"
        className="gallery-detail__stage-trigger"
        aria-label={galleryOpenLightboxLabel(selectedIndex)}
        onClick={() => setLightboxOpen(true)}
      >
        <GalleryDetailStage
          url={current?.url ?? ''}
          title={title}
          index={selectedIndex}
          total={media.length}
          failed={failed || current === undefined}
          onError={() => markFailed(selectedIndex)}
        />
      </button>

      <p className="gallery-detail__zoom-hint">{GALLERY_DETAIL_COPY.zoomHint}</p>

      {many ? (
        <GalleryDetailThumbnails
          media={media}
          selectedIndex={selectedIndex}
          onSelect={select}
          hasFailed={hasFailed}
          onFailed={markFailed}
        />
      ) : null}

      {lightboxOpen ? (
        <GalleryDetailLightbox
          media={media}
          title={title}
          index={selectedIndex}
          failed={failed}
          onClose={() => setLightboxOpen(false)}
          onPrevious={selectPrevious}
          onNext={selectNext}
          onFailed={() => markFailed(selectedIndex)}
        />
      ) : null}
    </section>
  );
}
