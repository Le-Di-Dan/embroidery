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
  PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES,
  PUBLIC_SITEMAP_PRODUCT_KIND,
} from '../domain/public-sitemap.policy';
import {
  toPublicSitemapEntry,
  type PublicSitemapEntryView,
  type PublicSitemapView,
} from './public-sitemap.projection';

/**
 * One over the *combined* cap, per source.
 *
 * Deliberately not `cap / 2`: either kind alone may legitimately fill the whole
 * inventory, so neither source may be bounded below the total. Asking each for
 * `cap + 1` keeps both reads bounded while leaving the only cap that matters —
 * the sum — to be decided after both have answered.
 */
const FETCH_LIMIT_PER_SOURCE = PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES + 1;

@Injectable()
export class PublicSitemapQuery {
  constructor(
    @Inject(PUBLIC_PRODUCT_REPOSITORY) private readonly products: PublicProductRepository,
    @Inject(PUBLIC_GALLERY_ENTRY_REPOSITORY)
    private readonly gallery: PublicGalleryEntryRepository,
  ) {}

  async list(): Promise<PublicSitemapView> {
    const [products, gallery] = await Promise.all([
      this.products.listIndexable(FETCH_LIMIT_PER_SOURCE),
      this.gallery.listIndexable(FETCH_LIMIT_PER_SOURCE),
    ]);

    // One cap over the sum, checked before anything is projected: a response
    // is either the whole inventory or no response at all.
    this.assertWithinCap(products.length + gallery.length);

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
   * The cap is on what one sitemap file may carry, so it is asserted once over
   * the combined total — never twice over two independent halves, which would
   * have passed 30 000 + 30 000 while the emitted file held 60 000 URLs.
   *
   * Failing is deliberate: a crawler reads a truncated sitemap as a complete
   * one and treats the missing URLs as delisted, so a partial index is worse
   * than none — and dropping whichever kind happens to be second would be that
   * same partial index with a tie-break attached.
   */
  private assertWithinCap(totalRowCount: number): void {
    if (totalRowCount > PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES) {
      throw publicSitemapInventoryTooLarge();
    }
  }
}
