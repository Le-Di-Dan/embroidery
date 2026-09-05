import { VI_MESSAGES, messageView } from '@embroidery/i18n';

import { brandedPageTitle } from '../../../features/storefront-seo';
import type { Metadata } from 'next';

import { SecureLinkQueryProvider } from '../../../features/secure-link-access';
import { SecureQuotationScreen } from '../../../features/secure-quotation';

/**
 * `/truy-cap/bao-gia` — the customer's quotation, opened by a secure link
 * (`APP6-S01`).
 *
 * The route stays a thin Server Component: it names the page and mounts the
 * capability. Everything below it is client-side and must be, because the
 * credential that decides what to render lives in the URL **fragment** — which
 * no user agent ever sends to the origin. The server cannot see it, cannot
 * resolve it, and is not meant to: that is the whole reason the token travels
 * this way (`ADR-APP4-001` §11).
 *
 * The provider is APP4's route-local TanStack boundary — `retry: false`,
 * `gcTime: 0`, so nothing about this session outlives it in a cache.
 *
 * Deliberately `noindex, nofollow`, following the `APP4-S01` convention for a
 * security route. This page has no standalone audience — it is reached from one
 * personal link and shows nothing to anyone without one — so a crawler could
 * only ever produce visitors with no grant to open. No SEO copy, no canonical,
 * no Open Graph: none of those fields may carry a token, and the simplest way
 * to guarantee that is to have none of them.
 */
/**
 * The browser title and description, from the canonical Vietnamese message
 * repository (`packages/i18n/messages/vi/seo.json`, under `storefront.secureQuotation`).
 */
const seoMessage = messageView(VI_MESSAGES.seo, 'storefront.secureQuotation');

export const metadata: Metadata = {
  title: brandedPageTitle(seoMessage.text('title')),
  description: seoMessage.text('description'),
  robots: { index: false, follow: false },
};

export default function SecureQuotationPage() {
  return (
    <SecureLinkQueryProvider>
      <SecureQuotationScreen />
    </SecureLinkQueryProvider>
  );
}
