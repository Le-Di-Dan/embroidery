/**
 * The category slug **shape** — the one category rule this app is allowed to own
 * (`APP12-C01-C1`).
 *
 * Syntax is code; values are data. This module says what a slug may look like;
 * it says nothing about which slugs exist, and it must never grow a list.
 *
 * The expression is the API's `CATEGORY_SLUG_PATTERN`
 * (`apps/api/src/modules/catalog/domain/category-slug.ts`), transcribed rather
 * than imported because the API's domain layer is not on this app's import
 * graph — the Storefront reaches the backend through the generated client only.
 * The contract publishes the same pattern on every category `slug` property, so
 * a drift between the two is visible in the OpenAPI document, and the
 * Storefront's own boundary test asserts the two agree.
 *
 * Its only job is to keep a malformed value out of a query string before the
 * request is made. Whether a well-formed slug names a real category is answered
 * by the inventory, and ultimately by the database.
 */

/** Lowercase alphanumeric groups joined by single hyphens. ASCII only. */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The bound the API applies before a slug reaches an index probe. */
export const CATEGORY_SLUG_MAX_LENGTH = 80;

/** Whether `value` could be a category slug. Says nothing about existence. */
export function isCategorySlugShape(value: string): boolean {
  return value.length <= CATEGORY_SLUG_MAX_LENGTH && CATEGORY_SLUG_PATTERN.test(value);
}
