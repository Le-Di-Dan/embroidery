import { VI_MESSAGES, messageView } from '@embroidery/i18n';

import { brandedPageTitle } from '../../../features/storefront-seo';
import type { Metadata } from 'next';

import { SecureLinkQueryProvider } from '../../../features/secure-link-access';
import { SecureFinalPaymentScreen } from '../../../features/secure-final-payment';

/**
 * `/truy-cap/thanh-toan-con-lai` — the customer's remaining balance and the
 * order's completion status, opened by a secure link (`APP9-S01`).
 *
 * The one route this checkpoint creates: `NEW_STOREFRONT_ROUTES = 1`, and
 * `APP9-S02` does not exist. Payment status, the QR, the transfer instructions,
 * optional evidence and the delivered/completed status all live on this single
 * surface, because `APP9-D01` drew them as states of one page rather than as
 * pages.
 *
 * The path is a sibling of the delivered `truy-cap/{bao-gia,duyet-thiet-ke,
 * thanh-toan}` family and follows the same rule those set: Vietnamese, no
 * identifier in the path, no token in the path. `APP9-D01` annotates the route
 * as "final payment (secure link)" without prescribing a literal path, so the
 * name is taken from the approved page title — *Thanh toán phần còn lại*
 * (`816:12`) — rather than transliterating the backend's `final-payment`. The
 * deposit lane already owns `thanh-toan`, and a customer holding both links must
 * be able to tell which one they are on.
 *
 * The route stays a thin Server Component: it names the page and mounts the
 * capability. Everything below it is client-side and must be, because the
 * credential that decides what to render lives in the URL **fragment** — which
 * no user agent ever sends to the origin. The server cannot see it, cannot
 * resolve it, and is not meant to: that is the whole reason the token travels
 * this way (`ADR-APP4-001` §11).
 *
 * The provider is APP4's route-local TanStack boundary — `retry: false`,
 * `gcTime: 0`, so neither a balance response nor a QR blob outlives the session
 * that fetched it in a cache.
 *
 * Deliberately `noindex, nofollow`, following the `APP4-S01` convention for a
 * security route, and it joins the secure family rather than appearing in
 * Storefront navigation. This page has no standalone audience — it is reached
 * from one personal link and shows nothing to anyone without one — so a crawler
 * could only ever produce visitors with no grant to open. No SEO copy, no
 * canonical, no Open Graph: none of those fields may carry a token, and the
 * simplest way to guarantee that is to have none of them.
 */
/**
 * The browser title and description, from the canonical Vietnamese message
 * repository (`packages/i18n/messages/vi/seo.json`, under `storefront.secureFinalPayment`).
 */
const seoMessage = messageView(VI_MESSAGES.seo, 'storefront.secureFinalPayment');

export const metadata: Metadata = {
  title: brandedPageTitle(seoMessage.text('title')),
  description: seoMessage.text('description'),
  robots: { index: false, follow: false },
};

export default function SecureFinalPaymentPage() {
  return (
    <SecureLinkQueryProvider>
      <SecureFinalPaymentScreen />
    </SecureLinkQueryProvider>
  );
}
