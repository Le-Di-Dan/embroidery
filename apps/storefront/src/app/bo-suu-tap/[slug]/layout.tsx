import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { loadGalleryDetail } from '../../../features/gallery-detail/services/gallery-detail.server';

/**
 * The existence decision for `/bo-suu-tap/[slug]`, taken in the **shell** so the
 * response can still carry a status line (`APP12-H06`).
 *
 * The identical defect and the identical fix as `/san-pham/[slug]` — see that
 * segment's layout for the full mechanism. In short: this segment's
 * `loading.tsx` compiles to a `<Suspense>` boundary around the page, React
 * flushes the HTTP head as soon as the shell outside that boundary is complete,
 * and a `notFound()` raised from inside it arrives after `200` is already on the
 * wire. A layout renders outside the boundary, so the shell waits for it and the
 * status is still settleable when the decision is taken.
 *
 * `H01-F06` named only the Product route. The gallery detail route carries the
 * same `loading.tsx` and answered `200` for an unknown slug in exactly the same
 * way; it was measured here rather than assumed, and it is fixed in the same
 * change because a soft 404 on half the entity routes is not a fixed soft 404.
 *
 * `loadGalleryDetail` is React-`cache()`d per request, so this layout,
 * `generateMetadata` and the page component share one backend call.
 *
 * Only `not-found` is decided here. An `error` result passes through to the page,
 * which raises it into this segment's `error.tsx`: a failed read must reach the
 * retryable error surface rather than be reported as a missing entry.
 */
export default async function GalleryDetailLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadGalleryDetail(slug);

  // An unknown slug, a malformed slug, DRAFT, ARCHIVED and a published entry
  // with no currently deliverable image all arrive as one indistinguishable
  // `not-found`, exactly as the page treats them.
  if (result.kind === 'not-found') notFound();

  return children;
}
