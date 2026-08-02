import { toDiscoverCategorySlug, type DiscoverCategorySlug } from './discover-categories';
import { DISCOVER_CATEGORY_QUERY_KEY } from './discover-route';

/**
 * Resolution of the `?category=` URL state into one of three outcomes.
 *
 * `invalid` is deliberately distinct from `all`. Silently treating
 * `?category=nonsense` as "everything" would answer a question the visitor did
 * not ask and would let a mistyped or stale link render a full feed under a
 * meaningless URL; the approved not-found boundary is the honest response.
 */
export type DiscoverSelection =
  | { readonly kind: 'all' }
  | { readonly kind: 'category'; readonly slug: DiscoverCategorySlug }
  | { readonly kind: 'invalid' };

/** The query-parameter shape App Router hands a Server Component. */
export type DiscoverSearchParams = Record<string, string | string[] | undefined>;

/**
 * Resolves the requested category from URL search parameters. A repeated
 * parameter (`?category=a&category=b`) is invalid rather than "first wins":
 * there is no single selection to render, and picking one would misreport the
 * URL back to the visitor through the active chip.
 */
export function resolveDiscoverSelection(searchParams: DiscoverSearchParams): DiscoverSelection {
  const raw = searchParams[DISCOVER_CATEGORY_QUERY_KEY];
  if (raw === undefined) return { kind: 'all' };
  if (Array.isArray(raw)) return { kind: 'invalid' };

  const slug = toDiscoverCategorySlug(raw);
  return slug === undefined ? { kind: 'invalid' } : { kind: 'category', slug };
}

/** The category slug a resolved selection queries with, if any. */
export function selectionSlug(selection: DiscoverSelection): DiscoverCategorySlug | undefined {
  return selection.kind === 'category' ? selection.slug : undefined;
}
