import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { buildStorefrontProductDetailPath } from '../../../features/storefront-shell';
import { ProductDetailScreen, toProductDetailView } from '../../../features/product-detail';
import { loadProductDetail } from '../../../features/product-detail/services/product-detail.server';

/**
 * `force-dynamic` renders this segment per request and forbids a build-time or
 * full-route cached copy. That is correctness, not performance: the API re-reads
 * publication on every request precisely because nothing in this system
 * invalidates a cache, so a stored page could keep showing a Product the
 * operator has unpublished.
 */
export const dynamic = 'force-dynamic';

interface ProductDetailPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

/**
 * Metadata for one Product, from the same request-scoped read the page uses.
 *
 * Only facts the contract carries. No price or availability structured data, no
 * published date, author, technique or dimensions, and no Product JSON-LD: every
 * one of those would be a claim invented at render time. Product media is not
 * used as an Open Graph image either — no social-image policy exists yet, and
 * picking one here would quietly become it.
 *
 * The canonical is the route helper's **relative** path. The Storefront declares
 * no `metadataBase`, and fabricating a host to satisfy a canonical tag is how a
 * staging hostname ends up in production markup.
 */
export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadProductDetail(slug);

  // The not-found decision is taken here as well as in the page component, so
  // metadata never describes a Product the visitor may not see.
  //
  // A measured limitation, recorded rather than papered over: on Next 16.2.10 a
  // `notFound()` raised from a **dynamic** segment renders the approved
  // not-found surface but answers HTTP **200**, while the identical call from a
  // static segment (`/kham-pha`) answers 404. Six configurations were tried in
  // the running production stack — with and without `loading.tsx`, with and
  // without `error.tsx`, from `generateMetadata` and from the page, and with a
  // segment-local `not-found.tsx` — and an unconditional `notFound()` with no
  // awaits at all still answered 200. Nothing this route can rearrange changes
  // it (`FU-APP2-DETAIL-NOT-FOUND-STATUS-01`). The surface stays correct and
  // leaks no cause; only the status line is wrong.
  if (result.kind === 'not-found') notFound();
  // A genuine failure is left for the page to raise, so it reaches the route's
  // error boundary rather than being reported as a missing Product.
  if (result.kind !== 'found') return {};

  const { product } = result;
  const description = product.seo.description ?? product.description;

  return {
    title: product.seo.title ?? product.name,
    ...(description === undefined ? {} : { description }),
    alternates: { canonical: buildStorefrontProductDetailPath(product.slug) },
    robots: { index: product.seo.isIndexable, follow: true },
  };
}

/**
 * `/san-pham/[slug]` — the anonymous Product Detail page (IMP-D039).
 *
 * The read is request-scoped (`loadProductDetail` is React-`cache()`d), so this
 * component and `generateMetadata` share one backend call per browser request
 * and can never describe two different reads — while a new request still asks
 * the API again.
 *
 * The safe not-found is taken verbatim from the API: unknown slug, `DRAFT`,
 * `ARCHIVED` and non-public category all arrive here as one `not-found`, and the
 * page keeps them indistinguishable. A malformed slug never reaches the API at
 * all and lands in the same place. Anything else throws to the route's error
 * boundary, because telling a visitor an artwork does not exist when the
 * database is merely down would be a lie.
 */
export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug } = await params;
  const result = await loadProductDetail(slug);

  if (result.kind === 'not-found') notFound();
  if (result.kind === 'error') {
    throw new Error('The product detail request failed.');
  }

  return <ProductDetailScreen product={toProductDetailView(result.product)} />;
}
