import { GALLERY_DETAIL_COPY } from '../model/gallery-detail-copy';

/**
 * The route's loading state.
 *
 * A neutral stage and one honest line. No skeleton title, no placeholder
 * thumbnails and no reserved image box of a guessed ratio: the contract
 * publishes no dimensions, so a skeleton shaped like an artwork would be a
 * claim about an entry nobody has loaded yet — and would jump the moment the
 * real image arrived at a different shape.
 */
export function GalleryDetailLoading() {
  return (
    <div className="gallery-detail gallery-detail--loading">
      <div className="gallery-detail__stage gallery-detail__stage--empty">
        <p className="gallery-detail__stage-message">{GALLERY_DETAIL_COPY.loading}</p>
      </div>
    </div>
  );
}
