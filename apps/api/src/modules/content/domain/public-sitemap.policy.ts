/**
 * What the public SEO inventory advertises, and what it deliberately does not
 * (`APP11-B04`, DB5 Q-06).
 *
 * The operation answers one question — *which dynamic entity URLs may a search
 * engine index right now* — and every rule that shapes that answer is stated
 * here rather than inferred from a controller or a query builder.
 *
 * ## Path-agnostic by construction
 *
 * There is no route template, no origin and no absolute URL anywhere in this
 * feature. The API publishes a `kind` and a `slug`; the Storefront owns
 * `/san-pham/[slug]` and `/bo-suu-tap/[slug]` and composes the browser URL
 * itself. Encoding a browser route here would make an API deployment the thing
 * that breaks a URL rename, and would fork route authority across two apps.
 *
 * ## Public visibility is not sitemap visibility
 *
 * `is_indexable` is an SEO directive, not an access control. A `noindex`
 * Product or Gallery entry stays fully readable at its own address and simply
 * never appears in this inventory. The two questions are answered by two
 * different predicates on purpose, and the delivered reads keep the browsing
 * one unchanged.
 *
 * ## Static routes are not here
 *
 * `/`, `/kham-pha`, `/dich-vu`, `/chinh-sach/*` and every other fixed page is
 * Storefront route authority — the API does not know they exist and must not
 * claim to. `content_pages` is likewise untouched: `APP11-G01` rejected a
 * content-page API for this phase, and a table existing is not a reason to
 * query it.
 */

/**
 * The closed kind vocabulary: the two dynamic entity families APP11 publishes.
 *
 * Closed, and asserted closed by the contract suite. A third value is a
 * contract change that needs a checkpoint, not a string a future query can add
 * by accident.
 */
export const PUBLIC_SITEMAP_ENTRY_KINDS = ['PRODUCT', 'GALLERY'] as const;

export type PublicSitemapEntryKind = (typeof PUBLIC_SITEMAP_ENTRY_KINDS)[number];

export const PUBLIC_SITEMAP_PRODUCT_KIND: PublicSitemapEntryKind = 'PRODUCT';
export const PUBLIC_SITEMAP_GALLERY_KIND: PublicSitemapEntryKind = 'GALLERY';

/**
 * The canonical ordering: `kind` ascending, then `slug` ascending.
 *
 * Deterministic rather than SEO-significant — a sitemap consumer must not be
 * able to depend on database natural order, and two calls against unchanged
 * data must produce the same bytes. Not `updatedAt`: neither indexed read is
 * ordered by it, sorting on it would make an ordinary edit reshuffle the whole
 * inventory, and search engines take freshness from the value, never from the
 * position.
 *
 * `kind` is ordered by this constant's own array position, not alphabetically,
 * so the grouping is a decision recorded here rather than an accident of two
 * English words.
 */
export const PUBLIC_SITEMAP_ORDER = ['kind', 'slug'] as const;

/**
 * The hard safety cap on one inventory response — **combined across kinds**.
 *
 * 50 000 is the sitemap protocol's own per-*file* URL limit, and this operation
 * answers with exactly one file's worth of URLs. The bound is therefore on the
 * total the response carries, never on either kind separately: a per-kind cap
 * would have admitted 30 000 Products plus 30 000 gallery entries — 60 000 URLs
 * in one sitemap, with neither kind tripping its own guard and the protocol
 * limit breached by a response every individual check called safe.
 *
 * Each source is asked for `cap + 1` rows and the two lengths are summed before
 * anything is projected; a sum above the cap means the true inventory is larger
 * than the contract can honour, and the operation **fails**. Silent truncation
 * is the one outcome this endpoint must never produce, and preferring one kind
 * over the other is the same failure wearing a policy: a search engine cannot
 * tell a truncated sitemap from a complete one, and would read the missing URLs
 * as delisted.
 *
 * The store is one physical shop with a bounded catalogue, so this is a
 * tripwire for an unforeseen future, not a working page size. Reaching it is
 * the signal that a paged sitemap-index protocol has become necessary — a
 * contract change, and therefore a checkpoint.
 */
export const PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES = 50_000;

/**
 * `no-store`, exactly as the public Catalog and Gallery reads use.
 *
 * Publish, unpublish and an indexability change must be visible on the next
 * read, and this repository has no cache-invalidation consumer — the
 * `product.published` / `product.unpublished` outbox backlog still has no
 * dispatcher. Any stored copy of this JSON could therefore outlive an unpublish
 * and keep advertising a withdrawn URL to a crawler. Until a canonical
 * invalidation consumer exists, not storing is the only policy that cannot
 * defeat the lifecycle.
 */
export const PUBLIC_SITEMAP_CACHE_CONTROL = 'no-store' as const;
