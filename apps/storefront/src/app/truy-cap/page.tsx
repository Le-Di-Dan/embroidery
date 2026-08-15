import type { Metadata } from 'next';

import { SecureLinkQueryProvider } from '../../features/secure-link-access';

/**
 * `/truy-cap` — `APP4-S02`, the secure-link landing.
 *
 * The route stays a thin Server Component: it names the page and mounts the
 * capability. Everything below it is client-side and must be, because the
 * credential that decides what to render lives in the URL **fragment** — which
 * no user agent ever sends to the origin. The server cannot see it, cannot
 * resolve it, and is not meant to: that is the whole reason the token travels
 * this way (`ADR-APP4-001` §11).
 *
 * Deliberately `noindex, nofollow`, following the `APP4-S01` convention for a
 * security route. This page has no standalone audience — it is reached from one
 * personal link and shows nothing to anyone without one — so a crawler could
 * only ever produce visitors with no grant to open. No SEO copy, no canonical,
 * no Open Graph: none of those fields may carry a token, and the simplest way
 * to guarantee that is to have none of them.
 */
export const metadata: Metadata = {
  title: 'Truy cập an toàn — Nét Thêu',
  description: 'Mở liên kết truy cập an toàn cho yêu cầu thêu của bạn.',
  robots: { index: false, follow: false },
};

export default function SecureLinkLandingPage() {
  return <SecureLinkQueryProvider />;
}
