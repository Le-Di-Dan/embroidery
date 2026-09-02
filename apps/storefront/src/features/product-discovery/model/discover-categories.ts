/**
 * The Discover category navigation model (IMP-D038, made database-backed by
 * `APP12-C01-C1`).
 *
 * ## Where the categories come from
 *
 * From `GET /api/public/categories`, on every request. Not from a constant in
 * this file, and not from a generated contract enum — both of those were a
 * second, compiled-in taxonomy, and the running database had already outgrown
 * them: it held `ao-thun` while the Storefront's list said four categories
 * existed. A chip row assembled from source code cannot show a category the
 * operator added after the build, and that is precisely the failure
 * `CATEGORY_VALUE_SOURCE_OF_TRUTH = DATABASE` removes.
 *
 * So this module holds **no slug, no label and no ordering**. It holds the
 * shape of a chip and the rules for turning an inventory into chips — which is
 * what source code is for.
 *
 * ## What is still source-defined, and why that is not a category
 *
 * `Tất cả` is. It is a UI state meaning *no `category` query parameter at all*,
 * not a row anyone could publish, archive or rename. Putting an `all` row in the
 * database to satisfy symmetry would invent a category the store does not sell
 * from, and would give the unfiltered feed a second address.
 */
import type { PublicCategoryInventoryItemResponse } from '@embroidery/api-client';

import { DISCOVER_COPY } from './discover-copy';

/**
 * One publicly browsable category, exactly as the API published it.
 *
 * Aliased rather than redefined: a local interface would be a second place to
 * decide what a category carries, and would drift from the contract the moment
 * one of them changed.
 */
export type DiscoverCategory = PublicCategoryInventoryItemResponse;

/** A selectable chip: either the "all" UI state or one database category. */
export interface DiscoverChip {
  /** Stable id for React keys and test selection. */
  readonly id: string;
  /** Absent for "all", which omits the query entirely. */
  readonly slug?: string;
  readonly label: string;
}

/** The id of the non-category "all" chip. Not a slug, and never sent. */
export const DISCOVER_ALL_CHIP_ID = 'all';

/**
 * Builds the chip row: `Tất cả` first, then the inventory in the order the API
 * returned it.
 *
 * The order is **not** re-sorted here. The API orders by `display_order` then
 * `slug`, which is the operator's editorial authority; sorting again in the
 * client would be a second ordering authority, and the one that would silently
 * win. Labels are `category.name` — the operator's own text, rendered as data.
 */
export function toDiscoverChips(categories: readonly DiscoverCategory[]): readonly DiscoverChip[] {
  return [
    { id: DISCOVER_ALL_CHIP_ID, label: DISCOVER_COPY.categoryAllLabel },
    ...categories.map((category) => ({
      id: category.slug,
      slug: category.slug,
      label: category.name,
    })),
  ];
}

/**
 * Whether `slug` names a category currently in the public inventory.
 *
 * Membership is answered against the fetched rows, never against a compiled
 * list. A category published a minute ago is a valid selection; one archived a
 * minute ago is not — with no deployment either way.
 */
export function isKnownCategory(categories: readonly DiscoverCategory[], slug: string): boolean {
  return categories.some((category) => category.slug === slug);
}

/**
 * The inventory row for `slug`, or `undefined` when the inventory does not
 * carry it (`APP12-C03`).
 *
 * `isKnownCategory` answers *whether* a slug is selectable; this answers *what*
 * the selected category is. The metadata builder needs the row itself — the
 * operator's `name` for the title and `isIndexable` for the robots directive —
 * and reading it from the same fetched inventory the chips are built from is
 * what keeps the head, the chip row and the sitemap describing one category.
 *
 * Nothing here decides which categories exist, and nothing may reconstruct a
 * name from a slug: an absent row is `undefined`, never a fabricated category.
 */
export function findDiscoverCategory(
  categories: readonly DiscoverCategory[] | undefined,
  slug: string | undefined,
): DiscoverCategory | undefined {
  if (categories === undefined || slug === undefined) return undefined;
  return categories.find((category) => category.slug === slug);
}
