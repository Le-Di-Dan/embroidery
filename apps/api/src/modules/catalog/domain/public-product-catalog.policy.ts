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
 * The association role a list card addresses.
 *
 * `APP2-B02` writes exactly one `THUMBNAIL` per product (the operator's first
 * selected image) and `GALLERY` for the rest, so a card has one truthful
 * candidate and never has to choose between several.
 */
export const PUBLIC_LIST_MEDIA_ROLE = 'THUMBNAIL' as const;

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
