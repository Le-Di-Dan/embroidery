import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { buildStorefrontGalleryDetailPath } from '../../../features/storefront-shell';
import { GalleryDetailScreen, toGalleryDetailView } from '../../../features/gallery-detail';
import { loadGalleryDetail } from '../../../features/gallery-detail/services/gallery-detail.server';

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
 * The canonical is the route helper's **relative** path, exactly as
 * `/san-pham/[slug]` emits one. The Storefront declares no `metadataBase`, and
 * fabricating a host to satisfy a canonical tag is how a staging hostname ends
 * up in production markup. `APP11-S04` owns the public origin, `metadataBase`,
 * `robots.ts`, `sitemap.ts`, global Open Graph defaults and BreadcrumbList
 * JSON-LD; none of them is started here.
 *
 * There is deliberately **no Open Graph block**. An OG image must be an
 * absolute URL, and Next resolves a relative one against `metadataBase` —
 * which this app does not set, so the framework would fall back to a guessed
 * `localhost` origin. Emitting a representative image therefore cannot be done
 * without inventing the public origin S04 owns, so OG handling is deferred
 * whole rather than half-emitted.
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

  return {
    title: entry.seo.title ?? entry.title,
    ...(description === '' ? {} : { description }),
    alternates: { canonical: buildStorefrontGalleryDetailPath(entry.slug) },
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

  return <GalleryDetailScreen entry={toGalleryDetailView(result.entry)} />;
}
