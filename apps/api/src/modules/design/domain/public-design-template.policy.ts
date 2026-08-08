/**
 * The public Design Template read policy (`APP3-B05`).
 *
 * Three constants, each a decision that would otherwise be an unexplained
 * literal in a controller.
 */

/**
 * Responses are never stored.
 *
 * The same value every public read in this system already answers with
 * (`PUBLIC_CATALOG_CACHE_CONTROL`, `PUBLIC_PLACEMENT_CACHE_CONTROL`,
 * `PUBLIC_SIDE_BACKGROUND_CACHE_CONTROL`), and for a reason that is sharper
 * here than anywhere else: a Design Template's visibility is revocable. An
 * `APP3-B04` unpublish or archive takes effect on the next read and there is no
 * cache-invalidation consumer anywhere in this system, so any stored copy would
 * keep a withdrawn Template visible for as long as it lived. A resource that can
 * disappear may not be cached as though it could not.
 */
export const PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL = 'no-store' as const;

/**
 * The public slug vocabulary: lowercase alphanumeric groups joined by single
 * hyphens.
 *
 * The exact shape `deriveTemplateSlugBase` emits, restated as an acceptance
 * pattern because the two do different jobs — one derives an address the server
 * owns, this one refuses an address no server could have derived, before it ever
 * reaches a `WHERE` clause. Bounded for the same reason
 * `TEMPLATE_SLUG_MAX_LENGTH` is: a slug reaches an index probe.
 */
export const PUBLIC_DESIGN_TEMPLATE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The largest page a public caller may request.
 *
 * Re-exported from `@embroidery/persistence` rather than restated, so the
 * published OpenAPI bound, the request schema's ceiling and the ceiling
 * `resolveLimit` silently clamps to are one fact. Written as a literal here it
 * would be three, and the first of them to change would leave a documented
 * maximum the server no longer honours.
 */
export { MAX_PAGE_SIZE as PUBLIC_DESIGN_TEMPLATE_MAX_PAGE_SIZE } from '@embroidery/persistence';
