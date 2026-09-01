import Link from 'next/link';

import { isCustomerRouteWithheld } from '../../release-isolation';
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
 *
 * ## Withheld with the capability (`APP12-G02-C1`)
 *
 * The block renders nothing while Wave 2 is withheld. Like the Homepage CTA it
 * is an ask end to end — its heading asks the question and its body sentence
 * (`Gửi yêu cầu để xưởng cùng bạn phác thảo ý tưởng`) is an instruction to use
 * the very route `src/proxy.ts` is answering with a `404` — so there is no part
 * of it that survives losing the anchor. Removing the anchor alone would leave
 * an invitation with nothing to accept.
 *
 * The entry above it is unaffected: the media, the narrative, the breadcrumb,
 * the related Product and `Continue Discovering` are all Wave-1 and all stay,
 * so the page still ends on a way onward. No replacement copy is introduced,
 * and releasing the capability restores this block as delivered.
 */
export function GalleryDetailCommission() {
  if (isCustomerRouteWithheld(STOREFRONT_CUSTOM_REQUEST_ROUTE)) {
    return null;
  }

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
