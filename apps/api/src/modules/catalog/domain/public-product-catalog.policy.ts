/**
 * What an anonymous caller may see of the catalog, and how it is addressed
 * (`APP2-B04`, queries Q-01 and Q-02).
 *
 * One place decides public visibility and public projection. The visibility
 * constants are **re-exported** from `product-publication.policy.ts` rather
 * than re-declared: the state that authorises publication and the state that
 * makes a product publicly readable have to be the same literal, or a future
 * edit to one silently forks the other and the catalog starts disagreeing with
 * the lifecycle that produced it. `APP2-T01` took the same approach for media
 * delivery, and these two must in turn agree with each other — a product whose
 * JSON is served but whose images are not is a broken page.
 */
import {
  APP2_CATEGORY_STATUS,
  PRODUCT_ARCHIVED_STATE,
  PRODUCT_DRAFT_STATE,
  PRODUCT_PUBLISHED_STATE,
} from './product-publication.policy';
import {
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
} from './public-product-media.policy';

export {
  APP2_CATEGORY_STATUS,
  PRODUCT_ARCHIVED_STATE,
  PRODUCT_DRAFT_STATE,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
};

/**
 * The only lifecycle state a public caller may observe.
 *
 * There is no separate "public" or "visible" flag on `products` and none may
 * be invented: `status = 'PUBLISHED'` is the whole predicate (DB5 Q-01
 * security scope, COL-TBL012-07). `DRAFT` and `ARCHIVED` are therefore both
 * absent for the same reason rather than by two different rules, and unpublish
 * (`TR-LC04-05`, `PUBLISHED → DRAFT`) removes a product from both operations on
 * the next read with no cache or snapshot to invalidate.
 */
export const PUBLIC_PRODUCT_VISIBLE_STATE = PRODUCT_PUBLISHED_STATE;

/**
 * The renditions each public projection addresses (`APP2-T01` wire values).
 *
 * Declared here as literals rather than imported from `@embroidery/contracts`:
 * that package resolves to raw TypeScript and the compiled API cannot
 * `require` it (IMP-D018). `public-product-catalog-path.spec.ts` asserts these
 * agree with the shared helper, which a spec may import because specs are
 * excluded from `dist`.
 */
export const PUBLIC_LIST_RENDITION = 'thumbnail' as const;
export const PUBLIC_DETAIL_RENDITION = 'catalog-preview' as const;

/**
 * The stored role that marks a product's canonical primary image.
 *
 * `APP2-B02` writes exactly one `THUMBNAIL` per product — the operator's first
 * selected image, at `display_order 0` — and `GALLERY` for the rest. This is
 * the *stored* designation. What a public surface actually shows is the
 * **effective** primary, which is this row only while it is still deliverable;
 * see {@link PUBLIC_EFFECTIVE_PRIMARY_ORDER}.
 */
export const PUBLIC_LIST_MEDIA_ROLE = 'THUMBNAIL' as const;

/**
 * The one rule that decides which image every public surface treats as primary
 * (`APP12-M01-B1` §6).
 *
 * ## The problem it fixes
 *
 * `APP12-M01.A` proved that a published product whose stored `THUMBNAIL` asset
 * later becomes ineligible — rejected, tombstoned, or left without a
 * deliverable derivative — answered **three different ways** on three surfaces.
 * The card resolved `role = 'THUMBNAIL'` strictly and so showed *no image at
 * all* while the product stayed listed and purchasable; the detail gallery
 * simply dropped the row and showed the next one; and `og:image`, which reads
 * the first element of that same gallery, silently substituted it. Nothing was
 * wrong with any one query — they just did not share a definition.
 *
 * ## The rule
 *
 * Among the images that are genuinely deliverable, order by:
 *
 * ```text
 * 1. are BOTH renditions serveable?  (yes first)
 * 2. is this the stored THUMBNAIL?   (yes first)
 * 3. display_order                    (ascending)
 * 4. id                               (ascending — total order)
 * ```
 *
 * and the first row is the effective primary. Three properties follow, and each
 * is the point:
 *
 * - **Nothing changes in the healthy case.** Every image is complete, so key 1
 *   ties for all of them and the stored `THUMBNAIL` wins on key 2 exactly as it
 *   always did.
 * - **The degradation is deterministic.** With the stored primary gone, the
 *   lowest `display_order` survivor wins — the same row, by the same
 *   comparison, for the card, the detail array, `og:image` and the JSON-LD
 *   image list, because all four are built from this one ordering.
 * - **A half-broken image cannot split the surfaces.** Key 1 exists because the
 *   card renders the `thumbnail` derivative and the detail renders
 *   `catalog-preview`, so "deliverable" is a *per-rendition* fact. An image
 *   whose preview failed but whose thumbnail survived is serveable to a card and
 *   invisible to the page it links to — the card would advertise a picture that
 *   does not exist on the product it opens. Demoting incomplete images ahead of
 *   every other consideration is what makes one row satisfy both surfaces, and
 *   "both renditions ready" is not a new standard: it is already what
 *   `PRODUCT_PUBLICATION_DERIVATIVE_KINDS` requires before a Product may be
 *   published at all.
 *
 * Key 2 is not redundant with key 3. `product_media` does **not** constrain the
 * `THUMBNAIL` to `display_order 0` and does not forbid a second one
 * (`APP12-M01.A` §E proved both by writing past the service), so a rule that
 * relied on position alone would be relying on an invariant the schema does not
 * hold. Ordering on the role makes the stored designation authoritative whenever
 * it is usable, and position the tie-break when it is not.
 *
 * An incomplete image is demoted, never withdrawn: it still appears in the
 * detail gallery when its own rendition is serveable, so the visitor loses a
 * *position*, not a photograph.
 *
 * This is a **read** rule. It never writes: no public projection promotes a row
 * or rewrites a role in the database, so a degraded product's stored order is
 * exactly what the operator left, and recovering the asset restores the
 * original primary with no repair step.
 */
export const PUBLIC_EFFECTIVE_PRIMARY_ORDER = [
  'both renditions deliverable desc',
  "role = 'THUMBNAIL' desc",
  'display_order',
  'id',
] as const;

/**
 * `no-store`, for the same reason `APP2-T01` uses it on the binary route.
 *
 * The correctness requirement is that unpublish takes effect on the next
 * authoritative read. There is no cache-invalidation consumer in this
 * repository — the `product.published` / `product.unpublished` outbox backlog
 * has no dispatcher, and B04 does not own one — so any stored copy of this
 * JSON could outlive an unpublish and keep a withdrawn product visible. Until a
 * canonical invalidation consumer exists, not storing is the only policy that
 * cannot defeat the lifecycle.
 */
export const PUBLIC_CATALOG_CACHE_CONTROL = 'no-store' as const;

/**
 * The canonical Q-01 ordering tuple: `display_order`, then `id`.
 *
 * `display_order` is the editorial order the operator controls; `id` is the
 * unique tie-breaker ADR-DB5-001 R2 requires, without which the order is not
 * total and pagination is silently non-deterministic. IDX-065
 * (`products (category_id, display_order, id) WHERE status='PUBLISHED'`) is
 * built on exactly this tuple.
 */
export const PUBLIC_LIST_ORDER = ['display_order', 'id'] as const;
