import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { loadProductDetail } from '../../../features/product-detail/services/product-detail.server';

/**
 * The existence decision for `/san-pham/[slug]`, taken in the **shell** so the
 * response can still carry a status line (`APP12-H06`, closing `H01-F06` and
 * `FU-APP2-DETAIL-NOT-FOUND-STATUS-01`).
 *
 * ## What was actually wrong
 *
 * `page.tsx` and `generateMetadata` both call `notFound()` for an unknown slug,
 * and both always did. The rendered surface was correct; only the status line
 * said `200`. `APP2-S02` and `APP12-H01` each recorded that as an unfixable
 * framework limitation — "nothing this route can rearrange changes it" — after
 * trying six arrangements. That conclusion was wrong, and the reason it looked
 * right is worth writing down so it is not re-derived a third time.
 *
 * `loading.tsx` in this segment is compiled by the App Router into a `<Suspense>`
 * boundary wrapped around the segment's children. Everything *outside* that
 * boundary is the streaming shell, and React flushes the HTTP head the moment
 * the shell is complete — which, with the page suspended behind the boundary,
 * is before the page has read anything. By the time `notFound()` is raised the
 * `200` is already on the wire, and Next can do nothing but render the not-found
 * body into the open stream.
 *
 * Measured on the running stack rather than reasoned about: with `loading.tsx`
 * present `/san-pham/<unknown>` answers `200`; with the identical file moved
 * away and the server restarted it answers `404`. The earlier attempts almost
 * certainly did move the file — but this repository's Windows bind mount does
 * not trigger a Turbopack recompile on a file *addition or removal*
 * (`APP12-C03`), so a dev server that was never restarted kept serving the old
 * route tree and reported the old status. The limitation was in the measurement,
 * not in the framework.
 *
 * ## Why a layout, and not a deleted `loading.tsx`
 *
 * Deleting the loading state would fix the status by removing an approved
 * design surface (`APP12-D01`), and it would take the skeleton away from
 * client-side navigations where it genuinely shows. A layout is the other half
 * of the same boundary: it renders *outside* the `<Suspense>`, so the shell
 * cannot complete until it has resolved, and the status is therefore still
 * settleable when the decision is taken.
 *
 * The read costs nothing extra. `loadProductDetail` is React-`cache()`d per
 * request, so this layout, `generateMetadata` and the page component share one
 * backend call — the same one the page was already making, simply awaited a
 * moment earlier in the tree.
 *
 * ## What is deliberately *not* decided here
 *
 * Only `not-found`. A `kind: 'error'` result is passed straight through to the
 * page, which raises it into this segment's own `error.tsx` — a failed read must
 * keep reaching the retryable error surface rather than being reported as a
 * missing Product. The layout renders no UI, reads no header and adds no
 * chrome: the shell above it already owns the page landmarks.
 */
export default async function ProductDetailLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadProductDetail(slug);

  // Unknown slug, malformed slug, DRAFT, ARCHIVED and non-public category all
  // arrive as one indistinguishable `not-found`, exactly as the page treats
  // them. Nothing about the cause reaches the response.
  if (result.kind === 'not-found') notFound();

  return children;
}
