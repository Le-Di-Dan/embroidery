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

/** One deliverable image of the public detail, in persisted display order. */
export interface PublicProductDetailMediaRow {
  readonly productMediaId: string;
  readonly role: string;
  readonly displayOrder: number;
}

export interface PublicProductDetail {
  readonly product: PublicProductDetailRow;
  readonly media: readonly PublicProductDetailMediaRow[];
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
}

export const PUBLIC_PRODUCT_REPOSITORY = Symbol('PublicProductRepository');
