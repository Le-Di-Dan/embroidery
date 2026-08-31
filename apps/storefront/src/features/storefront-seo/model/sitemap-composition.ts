import {
  PublicSitemapEntryResponseKind,
  type PublicSitemapEntryResponse,
} from '@embroidery/api-client';

import { toAbsolutePublicUrl } from '../../../config/public-origin';
import {
  buildStorefrontGalleryDetailPath,
  buildStorefrontProductDetailPath,
} from '../../storefront-shell';
import { PUBLIC_STATIC_ROUTES } from './public-static-routes';

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
 * `APP11-B04-C1` already caps the API's inventory at 50 000 combined across
 * kinds, and that guard remains the reason a runaway catalogue fails at the
 * source. But the API answers with entities, not URLs: this app adds the
 * Homepage, Discover, four canonical category states and the gallery feed on
 * top, so an inventory of exactly 50 000 would compose into 50 007 URLs — a file
 * that breaches the protocol with every individual check having passed. Only
 * this module knows the final browser URL list, so the final bound is enforced
 * here as well as there.
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
 * Composes the complete URL set: static routes first, in route authority order,
 * then the inventory in `APP11-B04`'s own deterministic `kind`-then-`slug`
 * order, preserved rather than re-sorted.
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
export function composeSitemap(inventory: readonly PublicSitemapEntryResponse[]): SitemapUrl[] {
  const total = PUBLIC_STATIC_ROUTES.length + inventory.length;
  if (total > SITEMAP_MAX_URLS) throw new SitemapCapacityExceededError();

  return [
    ...PUBLIC_STATIC_ROUTES.map((route) => ({ url: toAbsolutePublicUrl(route.path) })),
    ...inventory.map((entry) => ({
      url: toAbsolutePublicUrl(toEntityPath(entry)),
      lastModified: new Date(entry.updatedAt),
    })),
  ];
}
