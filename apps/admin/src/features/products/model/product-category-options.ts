/**
 * Category options for the Admin product form (`APP12-A01`).
 *
 * ## No taxonomy lives here
 *
 * This module used to hold a four-value slug list and, next to it,
 * `product-category.ts` held a slug-to-label map. Both were a second category
 * authority compiled into the Admin bundle: a category the operator added was
 * absent from the select, and a product already filed under one rendered as
 * `Không xác định` in the list. The store's own data was being second-guessed by
 * a constant.
 *
 * The options are the rows the runtime category inventory returns. The label is
 * `category.name`, the operator's own text.
 *
 * ## Why the form offers less than the inventory holds
 *
 * `APP12-C02` gave categories a lifecycle, and `CategoryResolver` — the one
 * place a `categorySlug` becomes a `category_id` on the Admin write path —
 * accepts a category only while it is `PUBLISHED`. So the assignable set is the
 * published set: offering a draft or an archived category would be offering a
 * choice the save is guaranteed to refuse.
 *
 * The **filter** deliberately does not narrow this way, and lives in
 * `product-filters.ts` for exactly that reason: finding the products left
 * behind under an archived category is a thing an operator must still be able
 * to do.
 *
 * What remains here is the shape of an option and the rule that the API's order
 * is the order — which is what source code is for.
 */
import { isCategoryAssignable } from '../../categories';
import type { ProductCategory } from '../services/category-inventory.service';

export interface ProductCategoryOption {
  readonly slug: string;
  readonly label: string;
}

/**
 * One option per **assignable** category, in the server's `displayOrder`
 * ordering.
 *
 * Not re-sorted: the ordering is the operator's editorial authority and the API
 * already applied it. Sorting again here would be a second authority, and the
 * one that would silently win.
 */
export function toProductCategoryOptions(
  categories: readonly ProductCategory[],
): readonly ProductCategoryOption[] {
  return categories
    .filter((category) => isCategoryAssignable(category.status))
    .map((category) => ({ slug: category.slug, label: category.name }));
}

/**
 * Whether `slug` names a category currently on offer for assignment.
 *
 * Answered against the fetched rows, never against a compiled list. Used to
 * decide whether an existing product's category can be pre-selected in the
 * form.
 */
export function isOfferedCategory(categories: readonly ProductCategory[], slug: string): boolean {
  return toProductCategoryOptions(categories).some((option) => option.slug === slug);
}

/**
 * The real name of the category a product is currently filed under, whatever
 * its lifecycle state — or `undefined` when the inventory has no such row.
 *
 * This exists so a product sitting under a category that has since been
 * archived can still be *described* truthfully. The alternatives all lie: an
 * `UNKNOWN` label denies a category the record plainly has, a fallback such as
 * `Khác` names a different category, and silently selecting the first available
 * option would reassign the product the moment the operator saved anything
 * else. The screen shows the real name and states that it must be reassigned;
 * the reassignment itself is the operator's, through the ordinary select.
 */
export function currentCategoryName(
  categories: readonly ProductCategory[],
  slug: string,
): string | undefined {
  return categories.find((category) => category.slug === slug)?.name;
}
