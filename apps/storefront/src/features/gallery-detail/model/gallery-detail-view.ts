import type {
  PublicGalleryAssetResponse,
  PublicGalleryEntryDetailResponse,
  PublicGalleryLinkedProductResponse,
} from '@embroidery/api-client';

/**
 * The projection boundary between the delivered `APP11-B03` contract and the
 * Gallery Entry Detail page.
 *
 * A narrowing, not a rename — the same discipline `toGalleryFeedCard` and
 * `toProductDetailView` apply. `PublicGalleryEntryDetailResponse` also carries
 * `galleryEntryId`, `displayOrder`, each asset's `assetId` and `position`, and
 * the whole `seo` object. None of them belongs in the rendered body, so all of
 * them are dropped **here** rather than carried into the component tree and
 * merely left unrendered. A field a component cannot see is a field it cannot
 * leak.
 *
 * Each dropped field, and why:
 *
 * - `galleryEntryId` — an opaque server identity. Nothing on this page
 *   addresses the entry by id: the media already arrive as paths and the
 *   canonical is built from the slug.
 * - `displayOrder` — the entry's editorial position *in the feed*. It says
 *   nothing about this page and printing it would expose the curator's
 *   ordering decisions as a number.
 * - `assets[].assetId` — likewise opaque, and likewise unnecessary: the URL is
 *   already unique per asset, so it serves as the React key.
 * - `assets[].position` — it is the array index by construction (`APP11-B03`
 *   renumbers over the deliverable images), so keeping it would invite a
 *   component to sort by it and thereby re-derive an order it was handed.
 * - `seo` — an SEO directive set, not content. It feeds `generateMetadata`
 *   from the raw response and has no business in the body: rendering
 *   `seo.title` beside `title` would print the same fact twice, and rendering
 *   `isIndexable` would leak an operator's indexing decision to a visitor.
 *
 * `linkedProduct` is kept whole because every field on it is already a public
 * catalog fact the Product Detail page renders itself — and the API returns
 * `null` both when there is no link and when the linked product is not
 * publicly visible, so this projection cannot tell those apart either.
 */

/** One image of the entry, in the exact order the API returned it. */
export interface GalleryDetailMedia {
  /**
   * Relative, publication-gated application path, exactly as the API composed
   * it (`APP11-B03`, detail rendition). Never rewritten, never derived from an
   * id, and never turned into a second rendition by string replacement — the
   * contract publishes one address per image and there is no other to guess.
   */
  readonly url: string;
}

/** The optional related Product affordance. */
export interface GalleryDetailLinkedProduct {
  readonly slug: string;
  readonly name: string;
  /**
   * Absent when the product has no deliverable catalog thumbnail. The section
   * then renders as text alone: an address built from the product id would
   * 404 at the catalog media route.
   */
  readonly thumbnailUrl?: string;
}

/** Everything the Gallery Entry Detail body is allowed to render. */
export interface GalleryDetailView {
  /** The entry's immutable address; the canonical and the breadcrumb use it. */
  readonly slug: string;
  readonly title: string;
  /**
   * The entry's editorial copy. `NOT NULL` on the entity, but an operator may
   * have saved an empty string, so the narrative section is omitted rather
   * than rendered as an empty heading.
   */
  readonly description?: string;
  /**
   * At least one image on any successful read: `APP11-B03` answers 404 for a
   * published entry with no currently deliverable image, so there is no
   * successful zero-image state to render and none is implemented.
   */
  readonly media: readonly GalleryDetailMedia[];
  /** Null when unlinked and null when the linked product is not public. */
  readonly linkedProduct: GalleryDetailLinkedProduct | null;
}

function toGalleryDetailMedia(asset: PublicGalleryAssetResponse): GalleryDetailMedia {
  return { url: asset.url };
}

function toGalleryDetailLinkedProduct(
  product: PublicGalleryLinkedProductResponse,
): GalleryDetailLinkedProduct {
  return {
    slug: product.slug,
    name: product.name,
    ...(product.thumbnailUrl === undefined ? {} : { thumbnailUrl: product.thumbnailUrl }),
  };
}

/**
 * Narrow the contract response to the view model.
 *
 * Media order is preserved exactly as received and is never recomputed. The
 * API returns the curator's stored order with the undeliverable images filtered
 * out, and that ordering *is* the curation — sorting by asset id, bucketing by
 * aspect ratio or promoting a "hero" would substitute our judgement for the
 * studio's. The array is copied rather than aliased so a component cannot
 * mutate the response object it was projected from.
 */
export function toGalleryDetailView(response: PublicGalleryEntryDetailResponse): GalleryDetailView {
  const description = response.description.trim();
  return {
    slug: response.slug,
    title: response.title,
    ...(description === '' ? {} : { description }),
    media: response.assets.map(toGalleryDetailMedia),
    linkedProduct:
      response.linkedProduct === null ? null : toGalleryDetailLinkedProduct(response.linkedProduct),
  };
}
