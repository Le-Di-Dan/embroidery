/**
 * What an anonymous caller may see of the gallery, and how it is ordered
 * (`APP11-B03`, queries over AGG-18).
 *
 * One place decides public visibility. The lifecycle constants are
 * **re-exported** from `admin-gallery-entry.policy.ts` rather than re-declared:
 * the state `APP11-B02` publishes *into* and the state that makes an entry
 * publicly readable have to be the same literal, or a future edit to one
 * silently forks the other and the showcase starts disagreeing with the
 * lifecycle that produced it. `public-product-catalog.policy.ts` took exactly
 * this approach for the catalog, and the two surfaces stay recognisably one
 * system because of it.
 */
import {
  GALLERY_ENTRY_ARCHIVED_STATE,
  GALLERY_ENTRY_DRAFT_STATE,
  GALLERY_ENTRY_PUBLISHED_STATE,
  GALLERY_ENTRY_SLUG_MAX_LENGTH,
  GALLERY_ENTRY_SLUG_PATTERN,
} from './admin-gallery-entry.policy';

export {
  GALLERY_ENTRY_ARCHIVED_STATE,
  GALLERY_ENTRY_DRAFT_STATE,
  GALLERY_ENTRY_PUBLISHED_STATE,
  GALLERY_ENTRY_SLUG_MAX_LENGTH,
  GALLERY_ENTRY_SLUG_PATTERN,
};

/**
 * The only lifecycle state a public caller may observe.
 *
 * `gallery_entries` carries no separate "visible" flag and none may be
 * invented: `status = 'PUBLISHED'` is the whole predicate, and IDX-066's
 * partial index is built on exactly it. `DRAFT` and `ARCHIVED` are therefore
 * both absent for the same reason rather than by two different rules, and
 * `APP11-B02`'s unpublish (`PUBLISHED → DRAFT`) withdraws an entry from every
 * operation here on the next read, with no cache or snapshot to invalidate.
 */
export const PUBLIC_GALLERY_ENTRY_VISIBLE_STATE = GALLERY_ENTRY_PUBLISHED_STATE;

/**
 * `is_indexable` is **not** a visibility predicate.
 *
 * A `noindex` entry is a published entry the store does not want in a search
 * index — it is still browsable, still linkable and still media-deliverable.
 * `APP11-B02` deliberately left `isIndexable` out of publication readiness for
 * the same reason. The constant exists so the intent is stated rather than
 * inferred from the absence of a condition in three query builders.
 */
export const PUBLIC_GALLERY_ENTRY_INDEXABILITY_IS_VISIBILITY = false;

/**
 * The canonical feed ordering tuple: `display_order`, then `id`.
 *
 * `display_order` is the editorial order the curator arranges; `id` is the
 * unique tie-breaker ADR-DB5-001 R2 requires, without which the order is not
 * total and keyset continuation is silently non-deterministic. IDX-066
 * (`gallery_entries (display_order, id) WHERE status='PUBLISHED'`) is built on
 * exactly this tuple, so the feed reads its own index rather than sorting.
 *
 * Not `created_at`, not `published_at` (no such column), not a random or a
 * height-derived order: masonry positioning is a Storefront concern and the API
 * source order stays linear and editorially meaningful.
 */
export const PUBLIC_GALLERY_LIST_ORDER = ['display_order', 'id'] as const;

/**
 * `no-store`, for the reason the catalog states and this surface inherits
 * unchanged.
 *
 * Unpublish must take effect on the next authoritative read. There is no
 * cache-invalidation consumer in this repository, so any stored copy of this
 * JSON could outlive an unpublish and keep a withdrawn entry visible.
 */
export const PUBLIC_GALLERY_CACHE_CONTROL = 'no-store' as const;
