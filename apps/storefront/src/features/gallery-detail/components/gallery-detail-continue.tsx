import Link from 'next/link';

import { STOREFRONT_GALLERY_ROUTE } from '../../storefront-shell';
import { GALLERY_DETAIL_COPY } from '../model/gallery-detail-copy';

/**
 * `Tiếp tục khám phá` — the truthful replacement for the draft's related feed.
 *
 * The historical UI05 detail draws a row of "related entries". There is **no
 * related-gallery operation anywhere in the API**, and manufacturing one
 * client-side — call the feed, drop the current slug, show three — would be a
 * curatorial recommendation the studio never made, dressed up as one they did.
 * The cards would also be chosen by `display_order`, which means "first in the
 * feed", not "related to this".
 *
 * One real link instead: back to the whole feed. It costs no extra request, it
 * claims nothing, and it is where a visitor who wants more actually wants to
 * go.
 */
export function GalleryDetailContinue() {
  return (
    <section className="gallery-detail__continue" aria-labelledby="gallery-detail-continue-heading">
      <h2 className="gallery-detail__continue-heading" id="gallery-detail-continue-heading">
        {GALLERY_DETAIL_COPY.continueHeading}
      </h2>
      <Link className="gallery-detail__continue-link" href={STOREFRONT_GALLERY_ROUTE}>
        {GALLERY_DETAIL_COPY.continueAll}
      </Link>
    </section>
  );
}
