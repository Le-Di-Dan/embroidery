import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { buildStorefrontProductDetailPath } from '../../../features/storefront-shell';
import {
  ProductDetailScreen,
  resolveProductBreadcrumb,
  toProductDetailView,
} from '../../../features/product-detail';
import { loadProductDetail } from '../../../features/product-detail/services/product-detail.server';
import { BreadcrumbJsonLd, publicPageMetadata } from '../../../features/storefront-seo';

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
 * The canonical still comes from the one route helper, and `APP11-S04` changed
 * only what it resolves against: the Storefront now declares a `metadataBase`
 * built from the configured public origin, so the same path this route always
 * emitted is published as an absolute URL instead of a host-less one. The route
 * model is untouched — no host is fabricated here, and none ever was.
 *
 * `APP11-S04` also adds the public Open Graph block. Its image is the Product's
 * **first already-public media path**, exactly as the page's own gallery renders
 * it: the same publication-gated delivery route, in the same persisted display
 * order, resolved against the same origin. Nothing is queried for it, no storage
 * URL is constructed and no "primary" image is inferred from `role` — a Product
 * with no deliverable media simply gets no `og:image`, which is the honest
 * answer rather than a placeholder.
 *
 * Still no price, availability, published date, author or `Product` JSON-LD:
 * every one of those would be a claim invented at render time. The only
 * structured data this page emits is the `BreadcrumbList` for the trail it
 * visibly draws (see the page component).
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

  const image = product.media[0]?.url;

  return {
    ...publicPageMetadata({
      path: buildStorefrontProductDetailPath(product.slug),
      title: product.seo.title ?? product.name,
      ...(description === undefined ? {} : { description }),
      ...(image === undefined ? {} : { imagePath: image }),
    }),
    // The operator's per-Product indexing decision, applied after the public
    // block so it can never be overwritten by it. `noindex` is not invisibility:
    // the page stays readable and keeps its self-canonical, and `APP11-B04`
    // simply leaves it out of the sitemap.
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

  const product = toProductDetailView(result.product);

  return (
    <>
      {/*
       * The visible breadcrumb, restated as `BreadcrumbList` structured data.
       *
       * There is no item list here. `APP11-S04` built a second one, and that is
       * precisely how the defect `APP11-S04-C1` corrects reached the rendered
       * trail and the structured data at once: each independently linked the
       * Product's Catalog category to `/kham-pha?category=<slug>`, which
       * Discover answers with its not-found boundary unless that slug is one of
       * its four filters. `resolveProductBreadcrumb` owns the sequence and both
       * consumers read it, so what a visitor walks and what a crawler parses are
       * the same object rather than two that happen to agree.
       *
       * Names and paths only, as before: no slug identity beyond the public
       * path, no `isIndexable`, no media reference, no category id — the item
       * type has no field for them.
       */}
      <BreadcrumbJsonLd items={resolveProductBreadcrumb(product)} />
      <ProductDetailScreen product={product} />
    </>
  );
}
