import type { PublicProductListResponse } from '@embroidery/api-client';

import { toDiscoverCard, type DiscoverCard } from '../../product-discovery';

/**
 * How the Homepage's two product-backed sections are fed (`APP11-S01` §8).
 *
 * There is **one** bounded catalog read for the whole page, not one per
 * section. Featured Works and the Discover preview then take deterministic,
 * **non-overlapping** slices of that single result: the same product can never
 * appear twice on the page, and a second identical request is never issued for
 * data the first one already returned.
 */

/** Featured Works: the editorial lead-in, kept deliberately small. */
export const HOMEPAGE_FEATURED_COUNT = 3;

/** Discover preview: the masonry taste of the feed (DESIGN_VISION §8). */
export const HOMEPAGE_PREVIEW_COUNT = 6;

/**
 * The single read's page size. Exactly what the two sections consume — asking
 * for more would pull rows across the wire that nothing on this page renders.
 */
export const HOMEPAGE_WORKS_LIMIT = HOMEPAGE_FEATURED_COUNT + HOMEPAGE_PREVIEW_COUNT;

/**
 * The Homepage's product sections in one value.
 *
 * `status` is what keeps a catalog failure local. `error` and `empty` are
 * ordinary render outcomes for two sections, never a page-level condition: the
 * Hero, Studio Story and Commission CTA are static and must survive an API
 * outage untouched (`APP11-S01` §14).
 */
export type HomepageWorks =
  | {
      readonly status: 'ready';
      readonly featured: DiscoverCard[];
      readonly preview: DiscoverCard[];
    }
  | { readonly status: 'empty' }
  | { readonly status: 'error' };

/**
 * Projects one catalog page onto the two sections.
 *
 * The card projection is `product-discovery`'s own `toDiscoverCard`, reused
 * rather than reimplemented. That is not incidental tidiness: it is the single
 * boundary where `price` and `isDisplayOutOfStock` are dropped from the public
 * product summary, and a second, parallel projection here would be a second
 * place for a commerce field to leak into an image-led surface.
 *
 * Fewer real products than the design's ideal density is a truthful outcome, not
 * a defect — the slices simply come back shorter. Nothing is padded, repeated or
 * fabricated to fill a grid.
 */
export function toHomepageWorks(page: PublicProductListResponse): HomepageWorks {
  const cards = page.items.map(toDiscoverCard);
  if (cards.length === 0) return { status: 'empty' };
  return {
    status: 'ready',
    featured: cards.slice(0, HOMEPAGE_FEATURED_COUNT),
    preview: cards.slice(HOMEPAGE_FEATURED_COUNT, HOMEPAGE_WORKS_LIMIT),
  };
}
