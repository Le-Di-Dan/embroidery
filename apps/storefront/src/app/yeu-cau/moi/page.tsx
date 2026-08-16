import type { Metadata } from 'next';

import { CUSTOM_REQUEST_COPY, CustomRequestQueryProvider } from '../../../features/custom-request';

/**
 * `/yeu-cau/moi` — `APP5-S01`, the route `APP5-D01` locks for request creation.
 *
 * A thin Server Component: it names the page and mounts the capability. The flow
 * is entirely client-side because every one of its states is the result of an
 * interaction, and the one piece of context it restores — the Studio's Design
 * Session handle — lives in `localStorage`, which the server cannot read and
 * must not pretend to.
 *
 * Deliberately `noindex`. A half-filled request form has no standalone audience
 * and is reached from a flow; surfacing it to a crawler would only produce
 * visitors with no design and no verification.
 */
export const metadata: Metadata = {
  title: `${CUSTOM_REQUEST_COPY.pageTitle} — Nét Thêu`,
  description: CUSTOM_REQUEST_COPY.pageIntro,
  robots: { index: false, follow: false },
};

export default function NewCustomRequestPage() {
  return <CustomRequestQueryProvider />;
}
