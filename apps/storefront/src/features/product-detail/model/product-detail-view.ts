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

/**
 * One gallery image, in the server's effective-primary order.
 *
 * Carries **two** addresses and **two** sizes, because the page renders the same
 * image at two very different scales: a large stage and a 64 px control. Before
 * `APP12-M01-B1` this model kept only `url`, so the strip pulled the
 * `catalog-preview` derivative into a thumbnail box — `APP12-H05` measured that
 * as 44 % of the page's image weight at three images, and `APP12-M01.A`
 * projected 6.63 MB at twenty.
 *
 * The dimensions were being discarded for a different reason: they simply did
 * not exist when this model was written. `APP12-H05-C1` added them to the
 * contract, and the comment that said the contract published none outlived the
 * fact by two checkpoints.
 */
export interface ProductDetailMedia {
  /** Relative, publication-gated path to the large `catalog-preview` derivative (`APP2-T01`). */
  readonly url: string;
  /** Intrinsic width of that derivative, when the server publishes one. Pairs with {@link height}. */
  readonly width?: number;
  /** Intrinsic height of that derivative. See {@link width}. */
  readonly height?: number;
  /**
   * The same association at the small `thumbnail` rendition.
   *
   * Falls back to {@link url} when the server publishes no thumbnail address, so
   * a strip control always has something to render — the weight is then wrong
   * for that one item, which is strictly better than a hole in the gallery.
   */
  readonly thumbnailUrl: string;
  /** Intrinsic width of the thumbnail derivative. Absent when {@link thumbnailUrl} fell back. */
  readonly thumbnailWidth?: number;
  /** Intrinsic height of the thumbnail derivative. See {@link thumbnailWidth}. */
  readonly thumbnailHeight?: number;
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
 * Media order is preserved exactly as received: the server already applies the
 * one effective-primary rule (`APP12-M01-B1` §6), so `media[0]` is the image the
 * card and `og:image` also name. Sorting, deduplicating or re-deriving a
 * "primary" from `role` here would substitute a second opinion for that one.
 * An empty array stays empty — it means the artwork has no published image yet,
 * which the page states honestly rather than papering over.
 *
 * Sizes are copied only as complete pairs. The contract publishes width and
 * height together or not at all, and a half-applied pair would produce an
 * `<img width>` with no `height`, which reserves a wrong box rather than none.
 */
export function toProductDetailView(response: PublicProductDetailResponse): ProductDetailView {
  const description = response.description?.trim();
  return {
    slug: response.slug,
    name: response.name,
    ...(description === undefined || description === '' ? {} : { description }),
    categorySlug: response.category.slug,
    categoryName: response.category.name,
    media: response.media.map((item) => ({
      url: item.url,
      ...intrinsicSize(item.width, item.height),
      // Falling back to the preview address keeps the control rendered when the
      // small derivative is not deliverable; its dimensions are deliberately not
      // carried across, because they describe the derivative we did not get.
      thumbnailUrl: item.thumbnailUrl ?? item.url,
      ...(item.thumbnailUrl === undefined
        ? {}
        : thumbnailSize(item.thumbnailWidth, item.thumbnailHeight)),
    })),
    price: response.price,
  };
}

/**
 * Both dimensions, present, finite and positive — or nothing at all.
 *
 * The server's all-or-none guarantee is re-checked rather than assumed: this
 * value is one step from becoming a rendered `width`/`height` attribute, and a
 * zero there collapses the very box the pair exists to reserve.
 */
function usablePair(
  width: number | undefined,
  height: number | undefined,
): { readonly width: number; readonly height: number } | undefined {
  if (width === undefined || height === undefined) return undefined;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return { width, height };
}

/** A complete size pair under the main-image field names, or nothing. */
function intrinsicSize(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } | Record<string, never> {
  const pair = usablePair(width, height);
  return pair === undefined ? {} : { width: pair.width, height: pair.height };
}

/**
 * The same pair under the thumbnail field names.
 *
 * A separate mapping, not a rename at the call site: the two describe different
 * derivatives, and spreading one where the other belongs would reserve the
 * preview's box for a 480 px control.
 */
function thumbnailSize(
  width: number | undefined,
  height: number | undefined,
): { thumbnailWidth: number; thumbnailHeight: number } | Record<string, never> {
  const pair = usablePair(width, height);
  return pair === undefined ? {} : { thumbnailWidth: pair.width, thumbnailHeight: pair.height };
}
