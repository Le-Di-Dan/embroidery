import { PublicProductListCategorySlug } from '@embroidery/api-client';

/**
 * The Discover category guidance (IMP-D038).
 *
 * The slugs come from the generated contract enum, never from a hand-kept list:
 * the API accepts exactly four categories and the database provisions exactly
 * those four, so deriving them here means a contract change shows up as a build
 * failure rather than as a chip that silently 404s. The Vietnamese labels are
 * the canonical category names.
 *
 * This is category guidance, not a filter system. UI02's draft frames sketch
 * style/theme/collection controls; `APP2-B04` supports none of them, so they are
 * omitted rather than faked.
 */

/** A selectable category, or "all" when `slug` is absent. */
export interface DiscoverCategory {
  /** Stable id for React keys and test selection. */
  readonly id: string;
  /** Absent for "all", which omits the query entirely. */
  readonly slug?: DiscoverCategorySlug;
  readonly label: string;
}

export type DiscoverCategorySlug =
  (typeof PublicProductListCategorySlug)[keyof typeof PublicProductListCategorySlug];

const CATEGORY_LABELS: Record<DiscoverCategorySlug, string> = {
  'thu-bong': 'Thú bông',
  khan: 'Khăn',
  'quan-ao': 'Quần áo',
  khac: 'Khác',
};

/** The four contract slugs, in contract order. */
export const DISCOVER_CATEGORY_SLUGS: readonly DiscoverCategorySlug[] = Object.values(
  PublicProductListCategorySlug,
);

/** "Tất cả" first, then the four categories in contract order. */
export const DISCOVER_CATEGORIES: readonly DiscoverCategory[] = [
  { id: 'all', label: 'Tất cả' },
  ...DISCOVER_CATEGORY_SLUGS.map((slug) => ({ id: slug, slug, label: CATEGORY_LABELS[slug] })),
];

/** Narrows an arbitrary URL value to a contract slug, or `undefined`. */
export function toDiscoverCategorySlug(value: unknown): DiscoverCategorySlug | undefined {
  return typeof value === 'string' && (DISCOVER_CATEGORY_SLUGS as readonly string[]).includes(value)
    ? (value as DiscoverCategorySlug)
    : undefined;
}
