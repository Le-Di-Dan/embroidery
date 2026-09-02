import type { PublicPriceResponse, PublicProductDetailResponse } from '@embroidery/api-client';

/**
 * The projection boundary between the delivered contract and the page.
 *
 * `publicProductDetail` returns `price` and `isDisplayOutOfStock`. `APP2-S02`
 * dropped both **here** rather than merely leaving them unrendered, because the
 * page was a studio Work Detail and not an ecommerce PDP (IMP-D039).
 *
 * `APP12-S01` reverses exactly half of that, under the Wave-1 Ready-Made
 * authority that made this page a place a customer buys something: `price` is
 * now carried, because the approved purchase panel states an amount before a SKU
 * is resolved (`906:189`, `906:143`) and the Product's own published catalog
 * price is the only truthful thing to state there.
 *
 * **`isDisplayOutOfStock` is still dropped, and that is not an oversight.** It
 * is an operator display flag, explicitly not a computed stock level (`BR-022`),
 * and `APP12-S01` §11/§19 forbid it as stock authority. Availability comes from
 * `APP12-B01`'s `availableQuantity` and from nowhere else, so the field stays
 * unavailable to this page's components by construction rather than by a
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
  /**
   * The Product's published catalog price, as the server states it (`APP12-S01`).
   *
   * Passed through untouched — a decimal string and a currency code — because
   * every amount on this page belongs to the server and nothing here may parse,
   * round or recompute one.
   */
  readonly price: PublicPriceResponse;
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
    price: response.price,
  };
}
