/**
 * The one public SEO inventory query (`APP11-B04`).
 *
 * Orchestration only: ask the two owning read ports, check the safety cap,
 * concatenate in the declared order, project. There is no transaction, no lock,
 * no cache and no write — the invariant that unpublishing or marking something
 * `noindex` takes effect on the next read is satisfied by there being nothing
 * between the caller and the rows.
 *
 * ## It owns no visibility rule of its own
 *
 * Whether a Product may be seen is decided by the Catalog public read port, and
 * whether a Gallery entry's detail would render is decided by the Gallery
 * public read port — the two modules that already own those predicates and
 * serve them to their own routes. This query adds nothing to either and
 * re-derives neither: it never touches a catalog or gallery table, and there is
 * no second definition of "public" in this file to drift from the first
 * (`BACKEND_CONVENTIONS.md` §10).
 *
 * That is also why the two calls are not one SQL statement. A union over
 * `products` and `gallery_entries` would have to restate both predicates in a
 * module that owns neither, and the day the Catalog publication rule changed,
 * the sitemap would quietly keep the old one.
 *
 * ## Two round trips, both indexed, both bounded
 *
 * The reads are independent, so they run concurrently: the cost is one round
 * trip's latency, not two. Each is a bounded indexed scan — never a page-by-page
 * walk of the public feeds, which would leak `noindex` rows into the sitemap and
 * misuse a browsing contract as a bulk export.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  PUBLIC_PRODUCT_REPOSITORY,
  type PublicProductRepository,
} from '../../catalog/domain/repositories/public-product.repository';
import {
  PUBLIC_GALLERY_ENTRY_REPOSITORY,
  type PublicGalleryEntryRepository,
} from '../../gallery/domain/repositories/public-gallery-entry.repository';
import { publicSitemapInventoryTooLarge } from '../domain/public-sitemap.errors';
import {
  PUBLIC_SITEMAP_GALLERY_KIND,
  PUBLIC_SITEMAP_MAX_ENTRIES_PER_KIND,
  PUBLIC_SITEMAP_PRODUCT_KIND,
} from '../domain/public-sitemap.policy';
import {
  toPublicSitemapEntry,
  type PublicSitemapEntryView,
  type PublicSitemapView,
} from './public-sitemap.projection';

/** One over the cap, so an oversized inventory is detected rather than cut. */
const FETCH_LIMIT = PUBLIC_SITEMAP_MAX_ENTRIES_PER_KIND + 1;

@Injectable()
export class PublicSitemapQuery {
  constructor(
    @Inject(PUBLIC_PRODUCT_REPOSITORY) private readonly products: PublicProductRepository,
    @Inject(PUBLIC_GALLERY_ENTRY_REPOSITORY)
    private readonly gallery: PublicGalleryEntryRepository,
  ) {}

  async list(): Promise<PublicSitemapView> {
    const [products, gallery] = await Promise.all([
      this.products.listIndexable(FETCH_LIMIT),
      this.gallery.listIndexable(FETCH_LIMIT),
    ]);

    // Checked before anything is projected: a response is either the whole
    // inventory or no response at all.
    this.assertWithinCap(products.length);
    this.assertWithinCap(gallery.length);

    // `kind` then `slug`, and the concatenation *is* the kind ordering — each
    // repository already returned its own half sorted by slug against a unique
    // column, so there is nothing left to sort in memory.
    const items: PublicSitemapEntryView[] = [
      ...products.map((row) => toPublicSitemapEntry(PUBLIC_SITEMAP_PRODUCT_KIND, row)),
      ...gallery.map((row) => toPublicSitemapEntry(PUBLIC_SITEMAP_GALLERY_KIND, row)),
    ];

    return { items };
  }

  /**
   * The over-fetched row means the true inventory exceeds the cap. Failing is
   * deliberate: a crawler reads a truncated sitemap as a complete one and
   * treats the missing URLs as delisted, so a partial index is worse than none.
   */
  private assertWithinCap(rowCount: number): void {
    if (rowCount > PUBLIC_SITEMAP_MAX_ENTRIES_PER_KIND) {
      throw publicSitemapInventoryTooLarge();
    }
  }
}
