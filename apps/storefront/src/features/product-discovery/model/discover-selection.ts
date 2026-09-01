import { CATEGORY_SLUG_PATTERN, isCategorySlugShape } from './category-slug-shape';
import { isKnownCategory, type DiscoverCategory } from './discover-categories';
import { DISCOVER_CATEGORY_QUERY_KEY } from './discover-route';

/**
 * Resolution of the `?category=` URL state into one of three outcomes.
 *
 * `invalid` is deliberately distinct from `all`. Silently treating
 * `?category=nonsense` as "everything" would answer a question the visitor did
 * not ask and would let a mistyped or stale link render a full feed under a
 * meaningless URL; the approved not-found boundary is the honest response.
 *
 * ## What "known" means since `APP12-C01-C1`
 *
 * Membership is decided against the **live category inventory**, not against a
 * compiled list of four slugs. A category the operator published this morning
 * is a valid selection immediately; one archived this morning stops being one.
 * Neither needs a deployment, and that is the whole point.
 *
 * `categories` is `undefined` when the inventory could not be read. That is
 * *unknown*, not *empty*, and the difference matters: narrowing against an
 * absent inventory would answer every category URL — including entirely valid
 * ones — with a 404 during a momentary API blip. So an unavailable inventory
 * falls back to slug **syntax**, which is a rule this app owns and can apply
 * without the network. A malformed value is still invalid either way; the feed
 * request behind it then answers an unknown-but-well-formed slug with an empty
 * page, which is the API's own safe policy.
 */
export type DiscoverSelection =
  | { readonly kind: 'all' }
  | { readonly kind: 'category'; readonly slug: string }
  | { readonly kind: 'invalid' };

/** The query-parameter shape App Router hands a Server Component. */
export type DiscoverSearchParams = Record<string, string | string[] | undefined>;

/**
 * Resolves the requested category from URL search parameters. A repeated
 * parameter (`?category=a&category=b`) is invalid rather than "first wins":
 * there is no single selection to render, and picking one would misreport the
 * URL back to the visitor through the active chip.
 */
export function resolveDiscoverSelection(
  searchParams: DiscoverSearchParams,
  categories: readonly DiscoverCategory[] | undefined,
): DiscoverSelection {
  const raw = searchParams[DISCOVER_CATEGORY_QUERY_KEY];
  if (raw === undefined) return { kind: 'all' };
  if (Array.isArray(raw)) return { kind: 'invalid' };

  // Syntax first, always. It is cheap, it is this app's own rule, and a
  // malformed value must never reach a query string.
  if (!isCategorySlugShape(raw)) return { kind: 'invalid' };

  // Then membership, but only when the inventory is actually known.
  if (categories !== undefined && !isKnownCategory(categories, raw)) {
    return { kind: 'invalid' };
  }
  return { kind: 'category', slug: raw };
}

/** The category slug a resolved selection queries with, if any. */
export function selectionSlug(selection: DiscoverSelection): string | undefined {
  return selection.kind === 'category' ? selection.slug : undefined;
}

export { CATEGORY_SLUG_PATTERN };
