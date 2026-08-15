import type { Metadata } from 'next';

import { VerificationQueryProvider } from '../../features/contact-verification';

/**
 * `/xac-minh-lien-he` — `APP4-S01`.
 *
 * The route stays a thin Server Component: it names the page and mounts the
 * capability. The flow is entirely client-side because every one of its states
 * is the result of an interaction, and there is nothing to render on the server
 * that would not immediately be replaced.
 *
 * Deliberately `noindex`. A verification screen has no standalone audience and
 * is reached from a flow; letting a crawler surface it would only produce
 * visitors with no challenge to answer.
 */
export const metadata: Metadata = {
  title: 'Xác minh liên hệ — Nét Thêu',
  description: 'Nhập email hoặc số điện thoại để nhận mã xác minh gồm 6 chữ số.',
  robots: { index: false, follow: false },
};

export default function ContactVerificationPage() {
  return <VerificationQueryProvider />;
}
