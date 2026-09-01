/**
 * What the public category inventory publishes, and what it deliberately does
 * not (`APP12-C01`).
 *
 * The operation answers one question — *which categories may an anonymous
 * caller browse by right now* — and every rule that shapes that answer is
 * stated here rather than inferred from a query builder.
 *
 * ## Visibility is not indexability
 *
 * These are two different questions and this file keeps them apart, exactly as
 * `public-sitemap.policy.ts` does for Products and gallery entries:
 *
 * ```text
 * PUBLISHED + is_indexable = true   -> in the inventory, and indexable
 * PUBLISHED + is_indexable = false  -> in the inventory, and NOT indexable
 * DRAFT                             -> absent
 * ARCHIVED                          -> absent
 * ```
 *
 * A `noindex` category is still a category a customer may filter by; it simply
 * must not appear in a sitemap or carry an indexable breadcrumb. Folding the two
 * into one predicate would either hide a browsable filter or advertise a URL the
 * store has asked search engines to ignore. The response therefore *carries*
 * `isIndexable` instead of filtering on it, so `APP12-C03` can make the SEO
 * decision without a second read and without re-deriving the rule.
 *
 * ## The visibility predicate is the one the Product reads already apply
 *
 * `status = 'PUBLISHED' AND archived_at IS NULL` — the same two terms
 * `drizzle-public-product.repository.ts` joins on for every public Product read.
 * Stated once here and consumed by both would be better still; it is restated
 * for the category subject because the Product reads own the *Product* question
 * and this owns the *category* one, and both must move together if either moves.
 *
 * ## Path-agnostic, and no physical identity
 *
 * The response carries `slug`, `name`, `isIndexable` and `displayOrder` and
 * nothing else. No `id`: the physical UUID is not public and never has been
 * (`APP2-B04`). No route, no absolute URL: the Storefront owns `/kham-pha` and
 * composes its own hrefs. No `description`, `seoTitle` or `seoDescription` —
 * those belong to a category *page*, which no checkpoint has approved.
 */
import type { CategoryState } from '@embroidery/database';

/** The one lifecycle state an anonymous caller may see. */
export const PUBLIC_CATEGORY_VISIBLE_STATE = 'PUBLISHED' as const satisfies CategoryState;

/**
 * The canonical ordering: `display_order` ascending, then `slug` ascending.
 *
 * `display_order` is the operator's own editorial authority — the column
 * migration `0033` seeded and `APP12-C02` will let an operator set. It is not
 * unique, so it cannot order a result set on its
 * own: `slug` is the tie-breaker, and it is unique globally (CST-011), which
 * makes the order total. Without that second term two categories sharing a
 * display order would come back in whatever order the plan happened to produce,
 * and the Storefront's chip row would reshuffle between requests.
 *
 * Insertion order is deliberately not used, and neither is `name`: a Vietnamese
 * collation decision must not be what fixes a navigation order.
 */
export const PUBLIC_CATEGORY_ORDER = ['displayOrder', 'slug'] as const;

/**
 * The hard safety bound on one inventory response.
 *
 * This is an inventory, not a feed: there is no cursor, because a consumer that
 * had to page a navigation taxonomy could render half of it. The store is one
 * physical shop, so a category count in the hundreds is already far past
 * anything real — the bound exists so an unforeseen future is detectable rather
 * than silently truncated. The repository is asked for `cap + 1` rows and the
 * query fails when more come back.
 */
export const PUBLIC_CATEGORY_MAX_ENTRIES = 500;

/**
 * `no-store`, exactly as the public Catalog, Gallery and sitemap reads use.
 *
 * Publishing, archiving or re-ordering a category must be visible on the next
 * read, and this repository still has no cache-invalidation consumer. A stored
 * copy of this JSON could keep offering a filter chip for a category the
 * operator has withdrawn.
 */
export const PUBLIC_CATEGORY_CACHE_CONTROL = 'no-store' as const;
