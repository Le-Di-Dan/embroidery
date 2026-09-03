/**
 * The category slug **shape** — the one category rule this app may own
 * (`APP12-C01-C1`, relocated by `APP12-A01`).
 *
 * Syntax is code; values are data. This module says what a slug may look like;
 * it says nothing about which slugs exist, and it must never grow a list.
 *
 * The expression is the API's `CATEGORY_SLUG_PATTERN`
 * (`apps/api/src/modules/catalog/domain/category-slug.ts`), transcribed rather
 * than imported because the API's domain layer is not on this app's import
 * graph — the Admin reaches the backend through the generated client only. The
 * contract publishes the same pattern on every category `slug` property, so a
 * drift between the two is visible in the OpenAPI document.
 *
 * Its only job is to keep a malformed value out of a request. Whether a
 * well-formed slug names a real category is answered by the inventory, and
 * ultimately by the database.
 *
 * ## Why it moved here
 *
 * It was written inside the product feature, which was then the only screen
 * that could name a category. `APP12-A01` adds the screen that *authors* one,
 * and a slug rule with two definitions is a rule that can disagree with itself.
 * It belongs to the capability that owns categories; the product feature reads
 * it across the public barrel like any other consumer.
 */

/** Lowercase alphanumeric groups joined by single hyphens. ASCII only. */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATEGORY_SLUG_MAX_LENGTH = 80;

/** Whether `value` could be a category slug. Says nothing about existence. */
export function isCategorySlugShape(value: string): boolean {
  return CATEGORY_SLUG_PATTERN.test(value);
}
