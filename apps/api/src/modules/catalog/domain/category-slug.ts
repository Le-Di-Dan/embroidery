/**
 * The dynamic category slug rule (`APP12-C01`).
 *
 * ## Why this file exists
 *
 * `APP2` shipped the four provisioned categories as a **closed enum** on the
 * wire (IMP-D032): `PublicCategoryResponse.slug`, both Product category filters
 * and the two Admin write bodies all published `thu-bong | khan | quan-ao |
 * khac`. That was never a property of the store — `categories.slug` is an
 * unconstrained `text` column with only a uniqueness index, and the running
 * database already holds a fifth category (`ao-thun`) whose Products the public
 * detail read serves today. `APP11-S04-C1` had to work around exactly that gap
 * (`FU-APP11-S04-C1-02`), and `APP12-P01` locked the production model as
 * `CATEGORY_MODEL = DYNAMIC`.
 *
 * So the contract stops naming members and starts naming a **shape**. The set of
 * categories is data; what a slug may look like is policy, and this is where
 * that policy lives.
 *
 * ## The rule is the repository's existing slug rule, not a new one
 *
 * Lowercase ASCII alphanumeric groups joined by single hyphens — byte-for-byte
 * the pattern `public-product.request.ts`, `public-design-template.policy.ts`
 * and `admin-gallery-entry.policy.ts` already apply to their own slugs. There is
 * no shared slug package to import from (each bounded context declares its own,
 * which is the convention), so this restates the same expression for the
 * category subject rather than inventing a looser `^[a-z0-9-]+$` that would
 * admit `--`, `-x` and `x-`: a slug this rule accepts must be one the store
 * could itself have minted.
 *
 * ## What it does *not* decide
 *
 * Whether a slug names a category that exists, is published, or is visible to an
 * anonymous caller. Those are database questions, answered per operation —
 * `CategoryResolver` for the Admin write path, the public read predicate for the
 * browsing path. Syntax is checked at the boundary so a malformed value never
 * reaches a WHERE clause; existence is checked against rows, because a taxonomy
 * that lives in a type is the defect this checkpoint removes.
 */

/**
 * Lowercase alphanumeric groups joined by single hyphens.
 *
 * Anchored, ASCII-only, and identical to the product/template/gallery slug
 * patterns. Unicode is deliberately excluded: a slug is a URL segment and a
 * database key, and `áo-thun` would be two different byte strings depending on
 * normalisation form.
 */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The bound the boundary applies before a slug reaches an index probe.
 *
 * Policy, not a column limit — `categories.slug` is `text`. 80 matches
 * `SLUG_MAX_LENGTH` in `product-slug.ts`, which is what the store's own
 * derivation would ever produce.
 */
export const CATEGORY_SLUG_MAX_LENGTH = 80;

/** Whether `value` is syntactically a category slug. Says nothing about existence. */
export function isCategorySlug(value: string): boolean {
  return value.length <= CATEGORY_SLUG_MAX_LENGTH && CATEGORY_SLUG_PATTERN.test(value);
}
