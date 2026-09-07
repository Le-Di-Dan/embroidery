/**
 * The read port behind the two public catalog queries (`APP2-B04`).
 *
 * Rows crossing this boundary are already narrowed to what a public caller may
 * see: the repository applies the publication predicate, so no caller can
 * forget it. The shapes below are still *internal* — they carry
 * `products.id` because keyset pagination needs a tie-breaker, and
 * `productMediaId` because the `APP2-T01` route addresses an association. The
 * projection layer decides which of these ever reach the wire, and the DTO
 * tests assert that neither product id nor category id does.
 */

import type { PublicMediaIntrinsicSize } from '../public-media-dimensions';

/** One row of the public list, before projection. */
export interface PublicProductListRow {
  /** Internal. Keyset tie-breaker only — never projected. */
  readonly id: string;
  /** Internal. Keyset sort value only — never projected. */
  readonly displayOrder: number;
  readonly slug: string;
  readonly name: string;
  readonly basePriceAmount: string;
  readonly currencyCode: string;
  readonly isDisplayOutOfStock: boolean;
  readonly categorySlug: string;
  readonly categoryName: string;
  /**
   * The `THUMBNAIL` association whose derivative is genuinely deliverable, or
   * `undefined` when this product has none. Resolved in the same statement, so
   * a page of N products costs one query rather than N+1.
   */
  readonly thumbnailProductMediaId: string | undefined;
  /**
   * Intrinsic size of the **list-rendition** derivative behind that
   * association, or `undefined` when the row carries none (`APP12-H05-C1`).
   * Resolved from the same correlated subquery text as the id above, so it
   * cannot describe a different derivative.
   */
  readonly thumbnailSize: PublicMediaIntrinsicSize | undefined;
}

/** The product half of the public detail, before projection. */
export interface PublicProductDetailRow {
  readonly slug: string;
  readonly name: string;
  readonly description: string | undefined;
  readonly basePriceAmount: string;
  readonly currencyCode: string;
  readonly isDisplayOutOfStock: boolean;
  readonly seoTitle: string | undefined;
  readonly seoDescription: string | undefined;
  readonly isIndexable: boolean;
  readonly categorySlug: string;
  readonly categoryName: string;
}

/**
 * One deliverable image of the public detail, in effective-primary order
 * (`PUBLIC_EFFECTIVE_PRIMARY_ORDER`) — so `media[0]` **is** the effective
 * primary and agrees with the card's thumbnail by construction.
 */
export interface PublicProductDetailMediaRow {
  readonly productMediaId: string;
  /** The **stored** role, exactly as persisted. The projection publishes the effective one. */
  readonly role: string;
  readonly displayOrder: number;
  /**
   * Intrinsic size of the **detail-rendition** derivative this row was selected
   * by, or `undefined` when it carries none (`APP12-H05-C1`). The statement
   * INNER JOINs that derivative, so the size and the URL share one source row.
   */
  readonly size: PublicMediaIntrinsicSize | undefined;
  /**
   * Whether this association's **list-rendition** derivative is itself
   * deliverable (`APP12-M01-B1`).
   *
   * Separate from {@link thumbnailSize} on purpose: a derivative may legitimately
   * carry no dimensions, so an absent size is not evidence of an absent
   * derivative, and conflating them would withhold a usable small rendition
   * from every historical image.
   */
  readonly thumbnailAvailable: boolean;
  /** Intrinsic size of that list-rendition derivative, or `undefined`. */
  readonly thumbnailSize: PublicMediaIntrinsicSize | undefined;
}

export interface PublicProductDetail {
  readonly product: PublicProductDetailRow;
  readonly media: readonly PublicProductDetailMediaRow[];
}

/**
 * The narrow public summary of a product another surface links to (`APP11-B03`
 * §8).
 *
 * Deliberately smaller than {@link PublicProductListRow}: a linking surface
 * needs an address, a name and a picture, not a price, a category or a stock
 * flag. It is served from this port rather than from a second query in the
 * linking module so that "is this product public" has exactly one answer in the
 * process — the one this repository already applies to its own two reads.
 */
export interface PublicLinkedProductRow {
  readonly slug: string;
  readonly name: string;
  /** The deliverable `THUMBNAIL` association, or `undefined` when there is none. */
  readonly thumbnailProductMediaId: string | undefined;
  /** Intrinsic size of that association's list-rendition derivative, if any. */
  readonly thumbnailSize: PublicMediaIntrinsicSize | undefined;
}

/**
 * One indexable public Product, as the SEO inventory needs it (`APP11-B04`).
 *
 * Two fields and no more: an address and a freshness stamp. Deliberately *not*
 * {@link PublicProductListRow} — a sitemap has no use for a price, a category,
 * a stock flag or a thumbnail, and a shape that carried them would invite them
 * onto a wire that must stay minimal.
 */
export interface PublicIndexableProductRow {
  readonly slug: string;
  readonly updatedAt: Date;
}

export interface PublicProductListQuery {
  readonly limit: number;
  readonly categorySlug: string | undefined;
  readonly after: { readonly displayOrder: number; readonly id: string } | undefined;
}

export interface PublicProductRepository {
  /**
   * Fetches at most `limit` rows in `(display_order, id)` order. The caller
   * over-fetches by one to answer "is there a next page" without a COUNT.
   */
  listPublished(query: PublicProductListQuery): Promise<readonly PublicProductListRow[]>;

  /** Resolves one published product and its deliverable media by exact slug. */
  findPublishedBySlug(slug: string): Promise<PublicProductDetail | undefined>;

  /**
   * Resolves the public summary of one product **by id**, or nothing when that
   * product is not publicly visible.
   *
   * By id rather than by slug because a linking row stores the id (REL-096),
   * and `undefined` covers every reason indistinguishably — unknown, draft,
   * archived, or in a withdrawn category. A caller therefore cannot learn that
   * an unpublished product exists, which is the whole point of routing the
   * question through the publication predicate instead of a label lookup.
   */
  findPublishedSummaryById(productId: string): Promise<PublicLinkedProductRow | undefined>;

  /**
   * Every Product an anonymous caller may see **and** that is marked indexable,
   * in `slug` order (`APP11-B04`).
   *
   * The same three visibility terms the other reads apply — published, public
   * category, category not archived — plus `is_indexable`, which the browsing
   * reads deliberately never filter on. Public visibility and sitemap
   * visibility are different questions: a `noindex` Product stays reachable at
   * its own URL and simply never appears here.
   *
   * `limit` is a safety bound the caller sets one above its own cap, so an
   * inventory larger than the contract can honour is detectable rather than
   * silently truncated. There is no cursor: this is an inventory, not a feed.
   */
  listIndexable(limit: number): Promise<readonly PublicIndexableProductRow[]>;
}

export const PUBLIC_PRODUCT_REPOSITORY = Symbol('PublicProductRepository');
