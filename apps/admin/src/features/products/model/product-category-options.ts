/**
 * Category options for the Admin product form (`APP12-C01-C1`).
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
 * The options are now the rows `GET /api/public/categories` returns — the same
 * set `CategoryResolver` will accept on save, so the form cannot offer a choice
 * the write path refuses. The label is `category.name`, the operator's own text.
 *
 * What remains here is the shape of an option and the rule that the API's order
 * is the order — which is what source code is for.
 */
import type { ProductCategory } from '../services/category-inventory.service';

export interface ProductCategoryOption {
  readonly slug: string;
  readonly label: string;
}

/**
 * One option per category, in the server's `display_order` ordering.
 *
 * Not re-sorted: the ordering is the operator's editorial authority and the API
 * already applied it. Sorting again here would be a second authority, and the
 * one that would silently win.
 */
export function toProductCategoryOptions(
  categories: readonly ProductCategory[],
): readonly ProductCategoryOption[] {
  return categories.map((category) => ({ slug: category.slug, label: category.name }));
}

/**
 * Whether `slug` names a category currently on offer.
 *
 * Answered against the fetched rows, never against a compiled list. Used to
 * decide whether an existing product's category can be pre-selected in the form:
 * a slug the inventory no longer contains cannot be represented by a `<select>`
 * option, so the field opens unset rather than silently showing the wrong one.
 */
export function isOfferedCategory(categories: readonly ProductCategory[], slug: string): boolean {
  return categories.some((category) => category.slug === slug);
}
