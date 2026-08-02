import type { PublicProductDetailResponse } from '@embroidery/api-client';

/**
 * The projection boundary between the delivered contract and the page.
 *
 * `publicProductDetail` returns `price` and `isDisplayOutOfStock`. This page is
 * a studio Work Detail, not an ecommerce PDP (IMP-D039), so those two fields are
 * dropped **here** rather than merely left unrendered. A component cannot show a
 * price it was never given, which makes the rule structural instead of a
 * convention someone has to remember while adding a section.
 *
 * `seo` is likewise not part of the view model: it feeds `generateMetadata` from
 * the raw response and has no business in the rendered body.
 */

/** One gallery image, in the server's persisted display order. */
export interface ProductDetailMedia {
  /** Relative, publication-gated application path (`APP2-T01`). */
  readonly url: string;
}

/** Everything the Product Detail body is allowed to render. */
export interface ProductDetailView {
  readonly slug: string;
  readonly name: string;
  /** Absent when the Product carries no description; the section is then omitted. */
  readonly description?: string;
  readonly categorySlug: string;
  readonly categoryName: string;
  readonly media: readonly ProductDetailMedia[];
}

/**
 * Narrow the contract response to the view model.
 *
 * Media order is preserved exactly as received: `display_order` is the studio's
 * own sequencing decision, and sorting, deduplicating or inferring a "primary"
 * image from `role` would substitute our judgement for theirs. An empty array
 * stays empty — it means the artwork has no published image yet, which the page
 * states honestly rather than papering over.
 */
export function toProductDetailView(response: PublicProductDetailResponse): ProductDetailView {
  const description = response.description?.trim();
  return {
    slug: response.slug,
    name: response.name,
    ...(description === undefined || description === '' ? {} : { description }),
    categorySlug: response.category.slug,
    categoryName: response.category.name,
    media: response.media.map((item) => ({ url: item.url })),
  };
}
