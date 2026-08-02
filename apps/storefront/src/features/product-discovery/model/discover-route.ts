/**
 * The Discover route and its category URL state (IMP-D038, `APP2-S01-G01`).
 *
 * The path is Product Owner authority, not a Figma label and not a guess: the
 * Storefront had exactly one browser route (`/`, Homepage-owned) until the
 * ruling supplied this one. `/discover`, `/catalog`, `/products` and
 * `/san-pham` are rejected, and no alias or redirect is approved, so this module
 * is the single place the path may be written.
 */

import { STOREFRONT_DISCOVER_ROUTE } from '../../storefront-shell';

/**
 * The canonical Discover browser route. No trailing slash is part of it.
 *
 * Re-exported from the shell rather than re-declared: routes are shell IA (the
 * header nav and the not-found recovery both target this one), and two literals
 * for one path is how an alias appears by accident.
 */
export const DISCOVER_ROUTE = STOREFRONT_DISCOVER_ROUTE;

/** The locked browser query key for category state. */
export const DISCOVER_CATEGORY_QUERY_KEY = 'category';

/**
 * Builds the href for a category selection. "All" omits the query rather than
 * sending a sentinel value, so the unfiltered feed has exactly one URL.
 */
export function buildDiscoverHref(categorySlug: string | undefined): string {
  if (categorySlug === undefined) return DISCOVER_ROUTE;
  return `${DISCOVER_ROUTE}?${DISCOVER_CATEGORY_QUERY_KEY}=${encodeURIComponent(categorySlug)}`;
}
