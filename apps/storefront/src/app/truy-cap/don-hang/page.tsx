import { VI_MESSAGES, messageView } from '@embroidery/i18n';

import { brandedPageTitle } from '../../../features/storefront-seo';
import type { Metadata } from 'next';

import { SecureLinkQueryProvider } from '../../../features/secure-link-access';
import { SecureOrderScreen } from '../../../features/secure-ready-made-order';

/**
 * `/truy-cap/don-hang` — the customer's Ready-Made order status and its FULL
 * payment, opened by a secure link (`APP12-S03`).
 *
 * The one route this checkpoint creates: `NEW_STOREFRONT_ROUTES = 1`, and there
 * is no second S03 route. Order status, the exact payable total, the transfer
 * instructions, the QR, optional evidence and every terminal state all live on
 * this single surface, because `APP12-D01` drew them as eight states of one
 * page rather than as pages (`911:305` — *không tạo 8 trang riêng*).
 *
 * The path is a sibling of the delivered `truy-cap/{bao-gia,duyet-thiet-ke,
 * thanh-toan,thanh-toan-con-lai}` family and follows the same rule those set:
 * Vietnamese, no identifier in the path, no token in the path. It is also the
 * exact route `APP12-G01` §2.2 reserved when it refused to block the
 * `/truy-cap` prefix wholesale, and the one `APP12-G02`'s release gate has been
 * asserting is *not* denied with Wave 2 withheld — so an `ORDER_ACCESS` link
 * opens here with `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false` (§37).
 *
 * The route stays a thin Server Component: it names the page and mounts the
 * capability. Everything below it is client-side and must be, because the
 * credential that decides what to render lives in the URL **fragment** — which
 * no user agent ever sends to the origin. The server cannot see it, cannot
 * resolve it, and is not meant to: that is the whole reason the token travels
 * this way (`ADR-APP4-001` §11).
 *
 * The provider is APP4's route-local TanStack boundary — `retry: false`,
 * `gcTime: 0` — so neither an order projection, an obligation, an evidence list
 * nor a QR blob outlives the session that fetched it in a cache (§33).
 *
 * Deliberately `noindex, nofollow`, following the convention every private
 * route in this app uses (§35). This page has no standalone audience — it is
 * reached from one personal link and shows nothing to anyone without one — so a
 * crawler could only ever produce visitors with no grant to open. No canonical
 * and no Open Graph: none of those fields may carry an order fact or a token,
 * and the simplest way to guarantee that is to have none of them. `robots.txt`
 * already disallows the whole `/truy-cap` prefix, and the sitemap is composed
 * from the public inventory, which this route is not in.
 *
 * The metadata is a **static object** carrying no order fact whatsoever. A
 * title derived from the order code, the amount or the status would put
 * per-customer state into a browser history and any shared screenshot — the
 * same rule `APP12-S02` applied to the checkout's dynamic segment.
 */
/**
 * The browser title and description, from the canonical Vietnamese message
 * repository (`packages/i18n/messages/vi/seo.json`, under `storefront.secureOrder`).
 */
const seoMessage = messageView(VI_MESSAGES.seo, 'storefront.secureOrder');

export const metadata: Metadata = {
  title: brandedPageTitle(seoMessage.text('title')),
  description: seoMessage.text('description'),
  robots: { index: false, follow: false },
};

export default function SecureReadyMadeOrderPage() {
  return (
    <SecureLinkQueryProvider>
      <SecureOrderScreen />
    </SecureLinkQueryProvider>
  );
}
