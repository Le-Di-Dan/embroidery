'use client';

import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';
import { useGalleryCoverPreview } from '../hooks/use-gallery-cover-preview';

interface GalleryCoverProps {
  /** The cover asset's id, or `undefined` for an entry that has no images. */
  readonly assetId: string | undefined;
  /** Derived from the entry's title — the contract publishes no `altText`. */
  readonly alt: string;
}

/**
 * The cover thumbnail, or the neutral tile that stands in for it (`866:905`).
 *
 * ### The id is not an address
 *
 * `coverAssetId` is identity only. The bytes arrive through the authenticated
 * `APP11-B03A` preview operation and are rendered from a browser object URL, so
 * no storage key, bucket or signed link is ever built, held or exposed here.
 *
 * ### A failure is decoration missing, not information missing
 *
 * Absent, loading and failed all render the same neutral tile, and none of them
 * is an alert: the row states the title, the slug, the order and the status
 * without it. A missing image must never read as a missing entry, and a cover
 * request that fails must never fail the list around it.
 *
 * ### Alt text is derived, never persisted
 *
 * `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`. There is no `altText` anywhere in
 * the Gallery schema family, so the accessible name comes from the entry's own
 * title. The placeholder carries a description of its own state rather than
 * borrowing the image's name, because it is not the image.
 */
export function GalleryCover({ assetId, alt }: GalleryCoverProps) {
  const { objectUrl, failure } = useGalleryCoverPreview({ assetId });

  if (objectUrl !== null) {
    return (
      // A plain `<img>` and not `next/image`: the source is a per-session object
      // URL over authenticated bytes, which the image optimizer can neither
      // fetch nor cache. Dimensions are fixed in the stylesheet, so the cell
      // does not reflow when the bytes land.
      // eslint-disable-next-line @next/next/no-img-element
      <img className="gallery-cover" src={objectUrl} alt={alt} data-testid="gallery-cover-image" />
    );
  }

  const label =
    failure === null ? GALLERY_LIST_COPY.cover.placeholder : GALLERY_LIST_COPY.cover.failed;

  return (
    <span
      className="gallery-cover gallery-cover--placeholder"
      role="img"
      aria-label={label}
      data-testid="gallery-cover-placeholder"
    >
      <span className="gallery-cover__glyph" aria-hidden="true">
        ▣
      </span>
    </span>
  );
}
