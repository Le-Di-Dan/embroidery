import Link from 'next/link';

import { STOREFRONT_CUSTOM_REQUEST_ROUTE } from '../../storefront-shell';
import { GALLERY_DETAIL_COPY } from '../model/gallery-detail-copy';

/**
 * The soft commission call to action the approved detail frames end on.
 *
 * It targets the **existing** intake route the header IA item and the Homepage
 * CTA already use. There is no `/contact`, no `/commission-new`, no cart and no
 * checkout: a second door into the same flow is how two intake paths start
 * diverging, and APP5 owns that flow entirely.
 *
 * Deliberately soft. No price, no quote figure, no turnaround promise and no
 * "starting from" — nothing on this page knows any of that, and the request
 * flow itself is where the conversation actually begins.
 */
export function GalleryDetailCommission() {
  return (
    <section
      className="gallery-detail__commission"
      aria-labelledby="gallery-detail-commission-heading"
    >
      <h2 className="gallery-detail__commission-heading" id="gallery-detail-commission-heading">
        {GALLERY_DETAIL_COPY.commissionHeading}
      </h2>
      <p className="gallery-detail__commission-body">{GALLERY_DETAIL_COPY.commissionBody}</p>
      <Link className="gallery-detail__commission-action" href={STOREFRONT_CUSTOM_REQUEST_ROUTE}>
        {GALLERY_DETAIL_COPY.commissionAction}
      </Link>
    </section>
  );
}
