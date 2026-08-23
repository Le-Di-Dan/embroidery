import type { Metadata } from 'next';

import { SecureLinkQueryProvider } from '../../../features/secure-link-access';
import { SecureDepositScreen } from '../../../features/secure-deposit-payment';

/**
 * `/truy-cap/thanh-toan` — the customer's deposit, opened by a secure link
 * (`APP7-S01`, route fixed by `APP7-D01` §10).
 *
 * The route stays a thin Server Component: it names the page and mounts the
 * capability. Everything below it is client-side and must be, because the
 * credential that decides what to render lives in the URL **fragment** — which
 * no user agent ever sends to the origin. The server cannot see it, cannot
 * resolve it, and is not meant to: that is the whole reason the token travels
 * this way (`ADR-APP4-001` §11).
 *
 * The provider is APP4's route-local TanStack boundary — `retry: false`,
 * `gcTime: 0`, so neither a deposit response nor a QR blob outlives the session
 * that fetched it in a cache.
 *
 * Deliberately `noindex, nofollow`, following the `APP4-S01` convention for a
 * security route, and it joins the existing `truy-cap/{bao-gia,duyet-thiet-ke}`
 * family rather than appearing in Storefront navigation. This page has no
 * standalone audience — it is reached from one personal link and shows nothing
 * to anyone without one — so a crawler could only ever produce visitors with no
 * grant to open. No SEO copy, no canonical, no Open Graph: none of those fields
 * may carry a token, and the simplest way to guarantee that is to have none of
 * them.
 */
export const metadata: Metadata = {
  title: 'Đặt cọc đơn hàng — Nét Thêu',
  description:
    'Xem thông tin chuyển khoản đặt cọc cho đơn hàng của bạn qua liên kết truy cập an toàn.',
  robots: { index: false, follow: false },
};

export default function SecureDepositPage() {
  return (
    <SecureLinkQueryProvider>
      <SecureDepositScreen />
    </SecureLinkQueryProvider>
  );
}
