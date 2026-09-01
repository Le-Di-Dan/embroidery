import {
  PublicSitemapEntryResponseKind,
  type PublicCategoryInventoryItemResponse,
  type PublicSitemapEntryResponse,
} from '@embroidery/api-client';

import { toAbsolutePublicUrl } from '../../../config/public-origin';
import { buildDiscoverHref } from '../../product-discovery';
import {
  buildStorefrontGalleryDetailPath,
  buildStorefrontProductDetailPath,
} from '../../storefront-shell';
import { DISCOVER_ROUTE_ID, PUBLIC_STATIC_ROUTES } from './public-static-routes';

/**
 * Composing the final `/sitemap.xml` URL set (`APP11-S04`).
 *
 * Pure: it takes the `APP11-B04` inventory and returns the framework's sitemap
 * shape. Fetching, failing and route wiring live elsewhere, which is what lets
 * the capacity arithmetic below be tested without inserting fifty thousand rows.
 */

/** The framework's sitemap entry shape, narrowed to the fields we emit. */
export interface SitemapUrl {
  readonly url: string;
  /** Present only for dynamic entities, which have an authoritative stamp. */
  readonly lastModified?: Date;
}

/**
 * The protocol's per-**file** URL limit, applied to the composed total.
 *
 * `APP11-B04-C1` already caps the API's entity inventory at 50 000 combined
 * across kinds, and `APP12-C01` caps the category inventory separately, and
 * both guards remain the reason a runaway catalogue fails at the source. But
 * neither API answers with URLs: this app adds the Homepage, Discover, the
 * gallery feed, the content pages **and one URL per indexable category** on top,
 * so an entity inventory of exactly 50 000 would compose into more than 50 000
 * URLs — a file that breaches the protocol with every individual check having
 * passed. Only this module knows the final browser URL list, so the final bound
 * is enforced here as well as there, over the sum of all three sources.
 */
export const SITEMAP_MAX_URLS = 50_000;

/**
 * Raised instead of emitting a shortened sitemap.
 *
 * Truncation is the one outcome this route must never produce. A crawler cannot
 * tell a partial sitemap from a complete one and reads the missing URLs as
 * delisted, so dropping the tail would quietly delist real pages; preferring
 * static URLs over dynamic ones, or Products over gallery entries, is the same
 * failure wearing a policy. Reaching this bound is the signal that a paged
 * sitemap-index protocol has become necessary — a new protocol surface, and
 * therefore a checkpoint, not a branch added here.
 */
export class SitemapCapacityExceededError extends Error {
  constructor() {
    super('The composed sitemap exceeds the maximum number of URLs one file may carry.');
    this.name = 'SitemapCapacityExceededError';
  }
}

/**
 * Maps one inventory entry to its browser path through the canonical builders.
 *
 * The two `kind` values are the contract's whole closed vocabulary, and the
 * `switch` is exhaustive against the generated enum rather than against two
 * strings, so a third kind becomes a compile error instead of a silently skipped
 * entry. Paths are never written literally here: `/san-pham/[slug]` and
 * `/bo-suu-tap/[slug]` are shell route authority, and a second literal is how an
 * alias appears by accident.
 */
function toEntityPath(entry: PublicSitemapEntryResponse): string {
  switch (entry.kind) {
    case PublicSitemapEntryResponseKind.PRODUCT:
      return buildStorefrontProductDetailPath(entry.slug);
    case PublicSitemapEntryResponseKind.GALLERY:
      return buildStorefrontGalleryDetailPath(entry.slug);
  }
}

/**
 * One `/kham-pha?category=<slug>` URL per **indexable** public category
 * (`APP12-C01-C1`).
 *
 * This is where the two category rules diverge, and the divergence is the
 * point. `GET /api/public/categories` returns every category a customer may
 * browse by, `is_indexable` included as a fact rather than as a filter, because
 * a `noindex` category is still a filter chip. A sitemap is the other question:
 * it may advertise only what the operator has asked search engines to index. So
 * Discover renders the whole inventory and this function renders a subset of it,
 * from one read, with the rule written once here.
 *
 * The href goes through `buildDiscoverHref` — the same builder the chips and the
 * breadcrumb use — so a sitemap URL cannot disagree with a rendered link about
 * how a category is addressed.
 *
 * Order is the API's `display_order`-then-`slug` ordering, preserved rather than
 * re-sorted: determinism is a requirement, and re-sorting here would be a second
 * ordering authority.
 */
function toCategoryUrls(categories: readonly PublicCategoryInventoryItemResponse[]): SitemapUrl[] {
  return categories
    .filter((category) => category.isIndexable)
    .map((category) => ({ url: toAbsolutePublicUrl(buildDiscoverHref(category.slug)) }));
}

/**
 * Composes the complete URL set: static routes first, in route authority order,
 * then one URL per indexable category, then the entity inventory in
 * `APP11-B04`'s own deterministic `kind`-then-`slug` order, preserved rather
 * than re-sorted.
 *
 * Determinism is a requirement, not a nicety — two calls against unchanged data
 * must produce the same file — and it is satisfied by two ordered arrays
 * concatenated, never by object key order or a hash iteration.
 *
 * `lastModified` is set only for dynamic entities, from the entity's own
 * `updatedAt`. The static half carries none: there is no authoring timestamp for
 * `/kham-pha` in this system, and the request time, the build time or
 * `Date.now()` would each be a freshness claim renewed on every crawl.
 *
 * A `noindex` Product or gallery entry never appears, because `APP11-B04`
 * already excluded it. That authority is not re-checked here: a second
 * indexability rule in the consumer is a second place for the two to disagree.
 */
export function composeSitemap(
  inventory: readonly PublicSitemapEntryResponse[],
  categories: readonly PublicCategoryInventoryItemResponse[],
): SitemapUrl[] {
  const categoryUrls = toCategoryUrls(categories);

  // The bound is over the composed total, which is now three sources rather than
  // two. Checked before anything is emitted: the file is complete or it is not
  // served.
  const total = PUBLIC_STATIC_ROUTES.length + categoryUrls.length + inventory.length;
  if (total > SITEMAP_MAX_URLS) throw new SitemapCapacityExceededError();

  // Category URLs sit immediately after Discover, whose filtered states they
  // are — the position the four compiled entries used to occupy, so the file's
  // shape is unchanged even though its category half is now data. Located by
  // id rather than by index: the static array is appended to over time, and a
  // positional assumption would silently misplace them.
  const discoverIndex = PUBLIC_STATIC_ROUTES.findIndex((route) => route.id === DISCOVER_ROUTE_ID);
  const insertAt = discoverIndex === -1 ? PUBLIC_STATIC_ROUTES.length : discoverIndex + 1;
  const staticUrls = PUBLIC_STATIC_ROUTES.map((route) => ({
    url: toAbsolutePublicUrl(route.path),
  }));

  return [
    ...staticUrls.slice(0, insertAt),
    ...categoryUrls,
    ...staticUrls.slice(insertAt),
    ...inventory.map((entry) => ({
      url: toAbsolutePublicUrl(toEntityPath(entry)),
      lastModified: new Date(entry.updatedAt),
    })),
  ];
}
