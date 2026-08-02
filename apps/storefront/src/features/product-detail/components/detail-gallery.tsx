'use client';

import { useState } from 'react';

import type { ProductDetailMedia } from '../model/product-detail-view';
import { openLightboxLabel, PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';
import { useGallerySelection } from '../hooks/use-gallery-selection';
import { DetailMediaStage } from './detail-media-stage';
import { DetailThumbnailStrip } from './detail-thumbnail-strip';
import { DetailLightbox } from './detail-lightbox';
import { DetailMediaEmpty } from './detail-media-empty';

interface DetailGalleryProps {
  readonly media: readonly ProductDetailMedia[];
  readonly name: string;
}

/**
 * The gallery island: which image is showing, which failed, and whether the
 * large view is open.
 *
 * With no media it degrades to an honest placeholder and **removes** the zoom
 * hint, the thumbnail strip and the lightbox trigger — an affordance that opens
 * an empty dialog is worse than no affordance.
 *
 * The stage opens the large view through a real `<button>` wrapping the image,
 * not a click handler on a `<div>`: the control has to be reachable by keyboard
 * and announce itself, and only a button does both for free.
 */
export function DetailGallery({ media, name }: DetailGalleryProps) {
  const { selectedIndex, select, selectPrevious, selectNext, hasFailed, markFailed } =
    useGallerySelection(media.length);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (media.length === 0) return <DetailMediaEmpty />;

  const current = media[selectedIndex];
  const failed = hasFailed(selectedIndex);

  return (
    <section className="product-detail__gallery" aria-label={PRODUCT_DETAIL_COPY.galleryLabel}>
      <button
        type="button"
        className="product-detail__stage-trigger"
        aria-label={openLightboxLabel(selectedIndex)}
        onClick={() => setLightboxOpen(true)}
      >
        <DetailMediaStage
          url={current?.url ?? ''}
          name={name}
          index={selectedIndex}
          total={media.length}
          failed={failed || current === undefined}
          onError={() => markFailed(selectedIndex)}
        />
      </button>

      <p className="product-detail__zoom-hint">{PRODUCT_DETAIL_COPY.zoomHint}</p>

      {media.length > 1 ? (
        <DetailThumbnailStrip
          media={media}
          selectedIndex={selectedIndex}
          onSelect={select}
          hasFailed={hasFailed}
          onFailed={markFailed}
        />
      ) : null}

      {lightboxOpen ? (
        <DetailLightbox
          media={media}
          name={name}
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
