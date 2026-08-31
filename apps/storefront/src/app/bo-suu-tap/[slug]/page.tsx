import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  buildStorefrontGalleryDetailPath,
  STOREFRONT_GALLERY_ROUTE,
} from '../../../features/storefront-shell';
import {
  GalleryDetailScreen,
  toGalleryDetailView,
  GALLERY_DETAIL_COPY,
} from '../../../features/gallery-detail';
import { loadGalleryDetail } from '../../../features/gallery-detail/services/gallery-detail.server';
import { BreadcrumbJsonLd, publicPageMetadata } from '../../../features/storefront-seo';

/**
 * `force-dynamic` renders this segment per request and forbids a build-time or
 * full-route cached copy. That is correctness, not performance: `APP11-B03`
 * re-reads publication *and* image eligibility on every request precisely
 * because nothing in this system invalidates a cache, so a stored page could
 * keep showing an entry the operator has unpublished or an image whose bytes
 * have been withdrawn.
 *
 * No `revalidate`, no `generateStaticParams` and no ISR: `APP11-S04` owns the
 * technical SEO infrastructure, and a revalidation window invented here would
 * be a durability decision nobody approved.
 */
export const dynamic = 'force-dynamic';

interface GalleryDetailPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

/**
 * Metadata for one gallery entry, from the same request-scoped read the page
 * uses.
 *
 * Only facts the contract carries. `seo.title` and `seo.description` are the
 * operator's overrides and fall back to the entry's own title and description;
 * `seo.isIndexable` is the operator's indexing decision and becomes the robots
 * directive, never body copy. A `noindex` entry stays fully readable — the API
 * resolves it normally, and indexability is not visibility.
 *
 * The canonical still comes from the one route helper, exactly as
 * `/san-pham/[slug]` emits one, and `APP11-S04` changed only what it resolves
 * against: the Storefront now declares a `metadataBase` built from the
 * configured public origin, so the same path this route always emitted is
 * published as an absolute URL. The route model is untouched.
 *
 * The Open Graph block `APP11-S03` deferred is delivered here
 * (`FU-APP11-S03-04`). S03's reason was exact — an OG image must be absolute,
 * and without a `metadataBase` the framework would have guessed `localhost` —
 * and it no longer holds. The image is the entry's **first already-public asset
 * path**, which is the cover: `assets[0]` is position 0 in the curated order and
 * is the same publication-gated delivery route the page renders. Nothing is
 * queried for it and no storage URL is composed. An entry the API returned with
 * no deliverable image cannot reach this page at all — that is one of the safe
 * 404 causes — so the absent-image branch is a contract guarantee rather than a
 * case seen in practice.
 */
export async function generateMetadata({ params }: GalleryDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadGalleryDetail(slug);

  // The not-found decision is taken here as well as in the page component, so
  // metadata never describes an entry the visitor may not see: no title, no
  // description, no canonical and — through the not-found surface's own head —
  // no index directive pointing at an address that renders nothing.
  //
  // A measured limitation carried over from `APP2-S02` and re-measured for this
  // route rather than assumed: on this Next version a `notFound()` raised from
  // a **dynamic** segment renders the approved not-found surface but answers
  // HTTP 200, while the identical call from a static segment answers 404.
  // Nothing this route can rearrange changes it
  // (`FU-APP2-DETAIL-NOT-FOUND-STATUS-01`). The surface stays correct and leaks
  // no cause; only the status line is wrong.
  if (result.kind === 'not-found') notFound();
  // A genuine failure is left for the page to raise, so it reaches the route's
  // error boundary rather than being reported as a missing entry.
  if (result.kind !== 'found') return {};

  const { entry } = result;
  const description = entry.seo.description ?? entry.description;

  const image = entry.assets[0]?.url;

  return {
    ...publicPageMetadata({
      path: buildStorefrontGalleryDetailPath(entry.slug),
      title: entry.seo.title ?? entry.title,
      ...(description === '' ? {} : { description }),
      ...(image === undefined ? {} : { imagePath: image }),
    }),
    // The operator's per-entry indexing decision, applied after the public block
    // so it can never be overwritten by it. A `noindex` entry stays fully
    // readable and keeps its self-canonical; `APP11-B04` simply leaves it out of
    // the sitemap. Indexability is not visibility.
    robots: { index: entry.seo.isIndexable, follow: true },
  };
}

/**
 * `/bo-suu-tap/[slug]` — the anonymous Gallery Entry Detail page.
 *
 * The read is request-scoped (`loadGalleryDetail` is React-`cache()`d), so this
 * component and `generateMetadata` share one backend call per browser request
 * and can never describe two different reads — while a new request still asks
 * the API again.
 *
 * The safe not-found is taken verbatim from the API: an unknown slug, a
 * malformed slug, a `DRAFT`, an `ARCHIVED` entry and a published entry with no
 * currently deliverable image all arrive here as one `not-found`, and the page
 * keeps them indistinguishable. Anything else throws to the route's error
 * boundary, because telling a visitor a collection does not exist when the
 * database is merely down would be a lie.
 *
 * The segment is deliberately thin: it resolves the slug, takes the visibility
 * decision, and hands a projected view to the feature. No composition, no
 * fetching and no copy live here.
 */
export default async function GalleryDetailPage({ params }: GalleryDetailPageProps) {
  const { slug } = await params;
  const result = await loadGalleryDetail(slug);

  if (result.kind === 'not-found') notFound();
  if (result.kind === 'error') {
    throw new Error('The gallery entry detail request failed.');
  }

  const entry = toGalleryDetailView(result.entry);

  return (
    <>
      {/*
       * The visible breadcrumb, restated as `BreadcrumbList` structured data.
       *
       * Two levels, because that is what the page draws and what the data model
       * has: `NESTED_COLLECTION_WORK_MODEL = false`, so there is no parent
       * collection between the feed and this entry and a third crumb would have
       * to name a grouping that does not exist. The label and the href are the
       * same copy constant and the same shell route the rendered `<nav>` uses.
       *
       * The entry itself carries a name and no URL — it is the page the visitor
       * is already on. No `galleryEntryId`, no `assetId`, no `isIndexable`:
       * the builder takes names and paths and has no field for them.
       */}
      <BreadcrumbJsonLd
        items={[
          { name: GALLERY_DETAIL_COPY.gallery, path: STOREFRONT_GALLERY_ROUTE },
          { name: entry.title },
        ]}
      />
      <GalleryDetailScreen entry={entry} />
    </>
  );
}
