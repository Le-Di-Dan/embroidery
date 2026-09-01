/**
 * The read port behind the public category inventory (`APP12-C01`).
 *
 * Rows crossing this boundary are already narrowed to what an anonymous caller
 * may see: the repository applies the visibility predicate, so no caller can
 * forget it — the same arrangement `public-product.repository.ts` uses, and for
 * the same reason.
 *
 * Its own port rather than a method on the Admin `CategoryRepository`: that one
 * creates rows, changes status and resolves a slug to a **physical id** for the
 * Admin write path. A public read must not be able to reach any of that, and a
 * graph that cannot inject it cannot call it.
 */

/** One publicly browsable category, before projection. */
export interface PublicCategoryRow {
  /** The stable public key. The physical UUID never leaves persistence. */
  readonly slug: string;
  /** Canonical Vietnamese label. */
  readonly name: string;
  /**
   * The SEO directive, carried rather than filtered on. A `noindex` category is
   * still browsable; only `APP12-C03` decides what that means for a sitemap.
   */
  readonly isIndexable: boolean;
  /** The operator's editorial position — the primary sort key, and public. */
  readonly displayOrder: number;
}

export interface PublicCategoryRepository {
  /**
   * Every category an anonymous caller may browse by, in `(display_order, slug)`
   * order.
   *
   * `limit` is a safety bound the caller sets one above its own cap, so an
   * inventory larger than the contract can honour is detectable rather than
   * silently truncated. There is no cursor: this is an inventory, not a feed.
   */
  listPublic(limit: number): Promise<readonly PublicCategoryRow[]>;
}

export const PUBLIC_CATEGORY_REPOSITORY = Symbol('PublicCategoryRepository');
