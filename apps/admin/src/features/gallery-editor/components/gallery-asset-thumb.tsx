'use client';

import { GALLERY_MEDIA_COPY } from '../model/gallery-media-copy';
import { useGalleryAssetPreview } from '../hooks/use-gallery-asset-preview';

interface GalleryAssetThumbProps {
  /** The asset's identity. Never an address — the bytes come from the API. */
  readonly assetId: string;
  /** Derived from the entry and the position; the contract stores no alt text. */
  readonly alt: string;
  readonly testId?: string;
}

/**
 * One gallery image, rendered from authenticated bytes (`870:926`).
 *
 * There is no `src` built from an id, no bucket, no object key and no signed
 * link: the only address here is a browser object URL over bytes that arrived
 * through the session the Admin app already holds, and the hook revokes it when
 * the image is replaced or unmounted.
 *
 * ### Three honest states, and none of them is a broken image
 *
 * Loading and failure both render a labelled tile rather than an `<img>`
 * pointing at nothing, so a preview that cannot be shown looks like a preview
 * that cannot be shown — not like a corrupt file. The tile carries text, so the
 * state survives without colour, and it is `role="img"` with an accessible name
 * rather than a decorative box that a screen reader would skip past silently.
 *
 * ### Alt text is derived, never persisted
 *
 * `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`. The contract publishes no `altText`
 * field, so the caller composes one from the entry's title and the image's
 * position. There is no alt input anywhere in this feature, because there is
 * nowhere for its value to go.
 */
export function GalleryAssetThumb({ assetId, alt, testId }: GalleryAssetThumbProps) {
  const preview = useGalleryAssetPreview(assetId);

  if (preview.objectUrl !== null) {
    return (
      // A plain `<img>` and not `next/image`: the source is a per-session
      // object URL over bytes this browser already holds, so there is nothing
      // for the optimizer to fetch, resize or cache — and pointing it at a
      // `blob:` handle would only add a loader that cannot resolve one.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="gallery-asset-thumb"
        src={preview.objectUrl}
        alt={alt}
        {...(testId === undefined ? {} : { 'data-testid': testId })}
      />
    );
  }

  const label = preview.isLoading
    ? GALLERY_MEDIA_COPY.row.previewLoading
    : GALLERY_MEDIA_COPY.row.previewFailed;

  return (
    <span
      className="gallery-asset-thumb gallery-asset-thumb--placeholder"
      role="img"
      aria-label={label}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      <span className="gallery-asset-thumb__note">{label}</span>
    </span>
  );
}
