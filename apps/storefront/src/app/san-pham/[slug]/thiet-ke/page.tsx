import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { StudioBootstrapIsland, STUDIO_COPY } from '../../../../features/design-studio';
import { loadProductDetail } from '../../../../features/product-detail/services/product-detail.server';

/**
 * `force-dynamic`, for the same reason the Product Detail segment above it uses
 * it: the API re-reads publication on every request precisely because nothing
 * in this system invalidates a cache, so a stored page could open the Studio on
 * a Product the operator has unpublished.
 */
export const dynamic = 'force-dynamic';

interface StudioPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function generateMetadata({ params }: StudioPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadProductDetail(slug);

  if (result.kind === 'not-found') notFound();
  if (result.kind !== 'found') return {};

  return {
    title: `${STUDIO_COPY.heading} — ${result.product.name}`,
    // The Studio is a working surface, not a landing page. Indexing it would put
    // a per-Product design tool into search results in place of the Product.
    //
    // `APP11-S04` corrected two things here (`FU-APP11-G01-07`). `follow` is now
    // `false`, matching every other private route in this app — a page a crawler
    // is told not to index is not a page whose outbound links it should be
    // mining. And the self-canonical is gone: this is a private surface, and a
    // canonical tag is a request to index *this* address, which is the opposite
    // of what the directive beside it says. The route, its Product resolution
    // and its not-found behaviour are untouched.
    robots: { index: false, follow: false },
  };
}

/**
 * `/san-pham/[slug]/thiet-ke` — the anonymous Studio bootstrap route
 * (`APP3-S01`).
 *
 * A thin server segment. It resolves the Product the URL names, takes the same
 * safe not-found the Product Detail page takes, renders the heading, and hands
 * the rest to the client island.
 *
 * It deliberately does **not** read the placement manifest. Side and Area are
 * interaction state that the visitor changes, and a server-rendered copy would
 * be a second answer to a question the island has to ask again on mount — the
 * duplicate fetch `APP3-S01` §20 rules out.
 *
 * The Studio is entered through a Product because a Design Session is opened on
 * one exact `product → side → area` placement; Side and Area are chosen inside
 * the route, never pinned in the path.
 */
export default async function StudioPage({ params }: StudioPageProps) {
  const { slug } = await params;
  const result = await loadProductDetail(slug);

  if (result.kind === 'not-found') notFound();
  if (result.kind === 'error') {
    throw new Error('The product detail request failed.');
  }

  // No `<main>` and no shell chrome here: `StorefrontShell` owns the landmarks
  // for every route, and this route reuses it unchanged. The approved Studio
  // frames keep the shared header and footer, so there is no reduced-chrome
  // layout to introduce and no other Storefront route is touched.
  return (
    <div className="studio-page">
      <h1 className="studio-page__heading">{STUDIO_COPY.heading}</h1>
      <StudioBootstrapIsland productName={result.product.name} productSlug={result.product.slug} />
    </div>
  );
}
