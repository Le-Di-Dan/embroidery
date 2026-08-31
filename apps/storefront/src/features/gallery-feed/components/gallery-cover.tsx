'use client';

import { useState } from 'react';

import { GALLERY_COPY, galleryCoverAlt } from '../model/gallery-copy';

/**
 * One card's cover image, with a failure that stays inside the card.
 *
 * `APP11-B03` guarantees a cover exists: an entry with no currently deliverable
 * image is omitted from the feed rather than listed with a broken card. What it
 * cannot guarantee is that the bytes still resolve *after* the page was
 * rendered — an operator can unpublish an entry or withdraw an image while a
 * visitor is reading, and the delivery route re-checks both on every request, so
 * the next `GET` legitimately 404s.
 *
 * That is what this component is for. The `onError` swap is per-image React
 * state, so one withdrawn cover degrades to the neutral placeholder in its own
 * card and every other card is untouched — no feed-wide error, no removed card
 * and no re-render of the collection. There is deliberately no retry: the route
 * answering 404 is the correct answer, and retrying would hammer it.
 *
 * The placeholder is a `role="img"` with an accessible name rather than an
 * `<img>` with a fabricated `src`. It asserts that this entry's picture is not
 * showing — not that the entry has none.
 */
export function GalleryCover({ coverUrl, title }: { coverUrl: string; title: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="gallery-feed__card-placeholder"
        role="img"
        aria-label={GALLERY_COPY.card.imageUnavailable}
      />
    );
  }

  return (
    // A plain <img>, not next/image: the cover is served by the
    // publication-gated API route, which re-checks publication on every request
    // and is `no-store`. next/image would also demand intrinsic dimensions, and
    // `APP11-B03` publishes none — supplying them would mean inventing a ratio
    // and cropping every cover to it, which is exactly what UI05's
    // variable-height masonry must not do.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="gallery-feed__card-image"
      src={coverUrl}
      alt={galleryCoverAlt(title)}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
