/**
 * The wire shape of the Admin category surface (`APP12-C02`).
 *
 * Separate from the DTO classes in `presentation/schemas/admin-category.response.ts`
 * for the reason `public-category.projection.ts` states: those exist for OpenAPI
 * and the generated client, these are what the runtime actually returns, and
 * keeping the two apart makes "added a field to one and forgot the other" a type
 * error rather than a silently undocumented field.
 *
 * ## What the Admin sees that the public read does not
 *
 * The physical `id`, the lifecycle `status`, `archivedAt`, the concurrency token
 * and the dependent-Product count. Every one of them is an operator fact: the id
 * is the key of the mutation routes, the status is what the lifecycle controls
 * act on, the token is what makes a write guarded, and the count is what tells
 * an operator why an archive will be refused before they attempt it.
 *
 * Deliberately still absent, in both directions: `description`, `seoTitle` and
 * `seoDescription`. Those belong to a category *page*, which no checkpoint has
 * approved, and publishing a field with no surface invites one to be invented.
 *
 * ## The physical id crosses this boundary, and only this one
 *
 * `AdminCategoryView.id` is the category UUID. It is published on the **Admin**
 * contract because Admin routes address rows by id throughout this repository
 * (`productId`, `jobId`, `orderId`), and because the alternative — keying
 * mutations on `slug` — would make the one field a DRAFT may still change also
 * the address used to change it. The public contract is untouched:
 * `PublicCategoryView` has no `id` and this module cannot reach it.
 */
import type {
  AdminCategory,
  AdminCategoryListEntry,
} from '../domain/repositories/admin-category.repository';

export interface AdminCategoryView {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
  readonly archivedAt: string | undefined;
  /** ISO-8601 with milliseconds — the exact token a guarded write must echo. */
  readonly updatedAt: string;
}

export interface AdminCategoryListItemView extends AdminCategoryView {
  readonly publishedProductCount: number;
}

export interface AdminCategoryListView {
  readonly items: readonly AdminCategoryListItemView[];
}

/** One row to one wire item. Total, and it invents nothing. */
export function toAdminCategoryView(category: AdminCategory): AdminCategoryView {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    status: category.status,
    isIndexable: category.isIndexable,
    displayOrder: category.displayOrder,
    archivedAt: category.archivedAt?.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export function toAdminCategoryListItem(entry: AdminCategoryListEntry): AdminCategoryListItemView {
  return {
    ...toAdminCategoryView(entry),
    publishedProductCount: entry.publishedProductCount,
  };
}
