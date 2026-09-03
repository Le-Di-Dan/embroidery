/**
 * Which fields a category's lifecycle state allows to be edited (`APP12-A01`).
 *
 * ## The matrix, and where it comes from
 *
 * | state | name | slug | isIndexable | displayOrder |
 * |---|---|---|---|---|
 * | `DRAFT` | editable | editable | editable | editable |
 * | `PUBLISHED` | editable | **locked** | editable | editable |
 * | `ARCHIVED` | read-only | **locked** | read-only | read-only |
 *
 * Every row is the `APP12-C02` contract, not a UI preference. `slug` freezes at
 * publication because it is the public URL key the storefront filters on and
 * the sitemap advertises, and the contract delivers no redirect and no alias —
 * so a rename would silently break every link to the category. An `ARCHIVED`
 * category is read-only outright.
 *
 * ## Why the UI mirrors a rule the server already enforces
 *
 * Not as the guard — the server refuses a published slug edit as
 * `CATEGORY_SLUG_IMMUTABLE` whatever this module says. It mirrors it so the
 * operator learns the rule *before* losing a keystroke to it, and so a locked
 * field is visibly locked with a stated reason rather than merely rejected on
 * save. A disabled control that carries no explanation is a dead end.
 *
 * A locked slug is still **rendered**: an operator must be able to read the
 * public address of the category they are looking at.
 */
import { AdminCategoryResponseStatus } from '@embroidery/api-client';

export type CategoryStatusValue =
  (typeof AdminCategoryResponseStatus)[keyof typeof AdminCategoryResponseStatus];

/** The editable scalar fields of a category. */
export type CategoryField = 'name' | 'slug' | 'isIndexable' | 'displayOrder';

const EDITABLE_BY_STATUS: Readonly<Record<string, readonly CategoryField[]>> = {
  [AdminCategoryResponseStatus.DRAFT]: ['name', 'slug', 'isIndexable', 'displayOrder'],
  [AdminCategoryResponseStatus.PUBLISHED]: ['name', 'isIndexable', 'displayOrder'],
  [AdminCategoryResponseStatus.ARCHIVED]: [],
};

/**
 * Whether `field` may be edited in `status`.
 *
 * Total by construction, and closed by default: a lifecycle state this build
 * does not know yields "nothing is editable", which is the only safe answer —
 * it shows the record truthfully and refuses to offer a write nobody approved.
 */
export function isCategoryFieldEditable(status: unknown, field: CategoryField): boolean {
  const editable = typeof status === 'string' ? EDITABLE_BY_STATUS[status] : undefined;
  return editable !== undefined && editable.includes(field);
}

/** Whether the whole record is read-only — the ARCHIVED case, and any unknown state. */
export function isCategoryReadOnly(status: unknown): boolean {
  const editable = typeof status === 'string' ? EDITABLE_BY_STATUS[status] : undefined;
  return editable === undefined || editable.length === 0;
}

/**
 * Whether the slug is locked *and* the operator should be told why.
 *
 * Distinct from "not editable": in `DRAFT` the slug is simply editable, and in
 * every other state it is frozen for a reason the screen must state.
 */
export function isCategorySlugLocked(status: unknown): boolean {
  return !isCategoryFieldEditable(status, 'slug');
}

/** Only a DRAFT may be published. */
export function canPublishCategory(status: unknown): boolean {
  return status === AdminCategoryResponseStatus.DRAFT;
}

/**
 * Only a PUBLISHED may be archived.
 *
 * `DRAFT -> ARCHIVED` is deliberately not offered: `APP12-C02` refuses it as
 * `CATEGORY_INVALID_TRANSITION`, and `ARCHIVED -> PUBLISHED` does not exist at
 * all — there is no relist and no restore.
 */
export function canArchiveCategory(status: unknown): boolean {
  return status === AdminCategoryResponseStatus.PUBLISHED;
}

/**
 * Whether a category may be *assigned* to a product.
 *
 * Publication is what makes a category assignable, so this is the one predicate
 * the Product authoring form filters its options by. It is stated here rather
 * than in the product feature because it is a fact about a category.
 */
export function isCategoryAssignable(status: unknown): boolean {
  return status === AdminCategoryResponseStatus.PUBLISHED;
}
